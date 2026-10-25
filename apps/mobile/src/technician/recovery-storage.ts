// Reuse the per-account secure-store/SQLite vault and its generation cleanup.
// The technician journal owns its API/user-bound namespace within that vault.
export {openMobileInventoryRecovery as openMobileTechnicianRecovery} from '../inventory/recovery-storage';
