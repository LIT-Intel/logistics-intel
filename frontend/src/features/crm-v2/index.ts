/**
 * crm-v2 — Command Center CRM rebuild (Pipeline · Tasks · Reports + Deal
 * panel + Lost-reason modal). Mounted by CommandCenter.tsx (orchestrator).
 */
export { default as PipelineV2, type PipelineV2Props } from "./PipelineV2";
export { default as TasksV2, type TasksV2Props } from "./TasksV2";
export { default as ReportsV2, type ReportsV2Props } from "./ReportsV2";
export { default as DealPanelV2, type DealPanelV2Props, type DealIntel } from "./DealPanelV2";
export { default as LostReasonModal, type LostReasonModalProps, LOST_REASONS } from "./LostReasonModal";
export { useCrmV2Data, getLayoutPref, setLayoutPref } from "./data/useCrmV2Data";
export * from "./api";
export * as computeCrm from "./data/computeCrm";
