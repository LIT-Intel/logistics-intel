/**
 * useCrmV2Data — one TanStack Query hook feeding PipelineV2 / TasksV2 /
 * ReportsV2. Wraps the existing src/api/crm.ts reads plus the crm-v2
 * api.ts additions. viewAsUserId ("" = All members) narrows deals+tasks
 * per the established ViewAsFilter semantics (owner/admin only; RLS keeps
 * regular members on their own rows regardless).
 */
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listDeals,
  listStages,
  listTasks,
  listOrgMembers,
  isOrgManager,
  type DealStage,
} from "@/api/crm";
import {
  listAutomationRules,
  listStageChangeActivity,
  type AutomationRule,
  type DealCardV2,
  type StageChangeEvent,
  type TaskV2,
} from "../api";

export type CrmV2Data = {
  deals: DealCardV2[];
  stages: DealStage[];
  tasks: TaskV2[];
  members: Array<{ user_id: string; name: string }>;
  isManager: boolean;
  rules: AutomationRule[];
  stageChanges: StageChangeEvent[];
  loading: boolean;
  error: string | null;
  /** Invalidate + refetch everything crm-v2 (after any mutation). */
  invalidate: () => Promise<void>;
  refetchDeals: () => Promise<void>;
  refetchTasks: () => Promise<void>;
  refetchRules: () => Promise<void>;
};

const KEY_ROOT = ["crm-v2"] as const;

export function useCrmV2Data(viewAsUserId: string = ""): CrmV2Data {
  const qc = useQueryClient();

  const stagesQ = useQuery({
    queryKey: [...KEY_ROOT, "stages"],
    queryFn: listStages,
    staleTime: 5 * 60_000,
  });
  const dealsQ = useQuery({
    queryKey: [...KEY_ROOT, "deals", viewAsUserId],
    queryFn: async () => (await listDeals(viewAsUserId || null)) as DealCardV2[],
    staleTime: 30_000,
  });
  const tasksQ = useQuery({
    queryKey: [...KEY_ROOT, "tasks", viewAsUserId],
    queryFn: async () => (await listTasks(viewAsUserId || null)) as TaskV2[],
    staleTime: 30_000,
  });
  const membersQ = useQuery({
    queryKey: [...KEY_ROOT, "members"],
    queryFn: listOrgMembers,
    staleTime: 5 * 60_000,
  });
  const managerQ = useQuery({
    queryKey: [...KEY_ROOT, "isManager"],
    queryFn: isOrgManager,
    staleTime: 5 * 60_000,
  });
  const rulesQ = useQuery({
    queryKey: [...KEY_ROOT, "rules"],
    queryFn: listAutomationRules,
    staleTime: 60_000,
  });
  const stageChangesQ = useQuery({
    queryKey: [...KEY_ROOT, "stage-changes"],
    queryFn: () => listStageChangeActivity(90),
    staleTime: 60_000,
  });

  const invalidate = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: KEY_ROOT });
  }, [qc]);
  const refetchDeals = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: [...KEY_ROOT, "deals"] });
    await qc.invalidateQueries({ queryKey: [...KEY_ROOT, "stage-changes"] });
  }, [qc]);
  const refetchTasks = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: [...KEY_ROOT, "tasks"] });
  }, [qc]);
  const refetchRules = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: [...KEY_ROOT, "rules"] });
  }, [qc]);

  return {
    deals: dealsQ.data ?? [],
    stages: stagesQ.data ?? [],
    tasks: tasksQ.data ?? [],
    members: membersQ.data ?? [],
    isManager: managerQ.data ?? false,
    rules: rulesQ.data ?? [],
    stageChanges: stageChangesQ.data ?? [],
    loading: stagesQ.isLoading || dealsQ.isLoading || tasksQ.isLoading,
    error:
      (stagesQ.error as Error | null)?.message ??
      (dealsQ.error as Error | null)?.message ??
      null,
    invalidate,
    refetchDeals,
    refetchTasks,
    refetchRules,
  };
}

/** Layout A/B preference, persisted per surface (spec §Layout switcher). */
export function getLayoutPref(key: string, fallback: "A" | "B" = "A"): "A" | "B" {
  try {
    const v = window.localStorage.getItem(key);
    return v === "A" || v === "B" ? v : fallback;
  } catch {
    return fallback;
  }
}
export function setLayoutPref(key: string, value: "A" | "B"): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}
