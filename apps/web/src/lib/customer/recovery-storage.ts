// Share the per-account encrypted vault and logout cleanup. Customer journals
// supply their own namespace; they never use an inventory/dealer identity.
export {openBrowserInventoryRecovery as openBrowserCustomerRecovery} from '../inventory/recovery-storage';
