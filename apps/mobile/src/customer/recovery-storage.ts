// Reuse the per-account secure-store/SQLite vault and its generation cleanup.
// The customer journal owns its API/user-bound namespace within that vault.
export {openMobileInventoryRecovery as openMobileCustomerRecovery} from '../inventory/recovery-storage';
