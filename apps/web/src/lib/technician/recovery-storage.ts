// Share the per-account encrypted vault and logout cleanup. Technician journals
// supply their own namespace; they never use an inventory/dealer identity.
export {openBrowserInventoryRecovery as openBrowserTechnicianRecovery} from '../inventory/recovery-storage';
