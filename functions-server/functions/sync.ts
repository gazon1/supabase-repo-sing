import type { Context } from "hono";
import { createClient } from "@supabase/supabase-js";
import DiffMatchPatch from "diff-match-patch";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SyncRequest {
  device_id: string;
  entity_id: string;
  entity_type: string;
  base_version: number;
  patch: Record<string, PatchOperation>;
}

type PatchOperation =
  | { ts: number; value: unknown }
  | { op: "add_to_set" | "remove_from_set"; values: unknown[] }
  | { value: string };

interface Shadow {
  data: Record<string, unknown>;
  version: number;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function sync(c: Context) {
  let body: SyncRequest;
  try {
    body = await c.req.json<SyncRequest>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { device_id, entity_id, entity_type, base_version, patch } = body;
  if (!device_id || !entity_id || !entity_type) {
    return c.json({ error: "Missing required fields: device_id, entity_id, entity_type" }, 400);
  }

  const supabase = createClient(
    Bun.env.SUPABASE_URL!,
    Bun.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1. Read shadow with pessimistic lock via SQL function
  const { data: shadow, error: shadowError } = await supabase
    .rpc("get_shadow_for_update", { p_entity_id: entity_id })
    .returns<Shadow>()
    .single();

  if (shadowError) {
    console.error("❌ Shadow fetch error:", shadowError);
    return c.json({ error: shadowError.message }, 500);
  }

  const shadowData = shadow?.data ?? {};
  const serverVersion = shadow?.version ?? 0;

  // 2. Three-way merge in JS
  const merged = mergePatch({
    shadow: shadowData,
    current: shadowData,
    clientPatch: patch,
    baseVersion: base_version,
    serverVersion,
  });

  // 3. Atomic write via SQL function
  const { error: applyError } = await supabase.rpc("apply_merged_state", {
    p_entity_id: entity_id,
    p_entity_type: entity_type,
    p_new_data: merged,
    p_new_version: serverVersion + 1,
    p_device_id: device_id,
  });

  if (applyError) {
    console.error("❌ Apply error:", applyError);
    return c.json({ error: applyError.message }, 500);
  }

  return c.json({ ok: true, version: serverVersion + 1, merged });
}

// ── Merge engine ──────────────────────────────────────────────────────────────

function mergePatch({
  shadow,
  current,
  clientPatch,
  baseVersion: _baseVersion,
  serverVersion: _serverVersion,
}: {
  shadow: Record<string, unknown>;
  current: Record<string, unknown>;
  clientPatch: Record<string, PatchOperation>;
  baseVersion: number;
  serverVersion: number;
}): Record<string, unknown> {
  const result: Record<string, unknown> = { ...current };
  const dmp = new DiffMatchPatch();

  for (const [field, op] of Object.entries(clientPatch)) {
    switch (fieldStrategy(field)) {
      case "lww": {
        const lwwOp = op as { ts: number; value: unknown };
        const serverTs = (current[`${field}_updated_at`] as number) ?? 0;
        if ((lwwOp.ts ?? 0) >= serverTs) {
          result[field] = lwwOp.value;
          result[`${field}_updated_at`] = lwwOp.ts;
        }
        break;
      }
      case "or_set": {
        const setOp = op as { op: "add_to_set" | "remove_from_set"; values: unknown[] };
        const baseSet = new Set(Array.isArray(shadow[field]) ? (shadow[field] as unknown[]) : []);
        const cur = new Set(Array.isArray(current[field]) ? (current[field] as unknown[]) : []);
        if (setOp.op === "add_to_set") {
          setOp.values?.forEach((v) => cur.add(v));
        } else {
          setOp.values?.forEach((v) => {
            if (!cur.has(v) || baseSet.has(v)) cur.delete(v);
          });
        }
        result[field] = [...cur];
        break;
      }
      case "dmp_text": {
        const textOp = op as { value: string };
        const base = (shadow[field] as string) ?? "";
        const server = (current[field] as string) ?? "";
        const client = textOp.value ?? "";
        if (client === base) {
          result[field] = server;
        } else if (server === base) {
          result[field] = client;
        } else {
          const patches = dmp.patch_make(base, client);
          const [mergedText, applied] = dmp.patch_apply(patches, server);
          if (applied.some((ok) => !ok)) {
            console.warn(`⚠️  DMP conflict in "${field}" — keeping server version`);
            result[field] = server;
          } else {
            result[field] = mergedText;
          }
        }
        break;
      }
    }
  }

  return result;
}

// ── Field strategy registry ───────────────────────────────────────────────────

const OR_SET_FIELDS  = new Set(["tags", "blocked_by_ids"]);
const DMP_TEXT_FIELDS = new Set(["description"]);

function fieldStrategy(field: string): "lww" | "or_set" | "dmp_text" {
  if (OR_SET_FIELDS.has(field))  return "or_set";
  if (DMP_TEXT_FIELDS.has(field)) return "dmp_text";
  return "lww";
}