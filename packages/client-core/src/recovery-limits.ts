/** Vault capacity covers three copies of a 1 MiB API aggregate plus metadata.
 * Individual domain journals may enforce smaller limits. */
export const protectedRecoveryMaxBytes=4*1024*1024;
export const protectedRecoveryMaxSealedBytes=protectedRecoveryMaxBytes+12+16;
export const protectedRecoveryMaxBase64Length=4*Math.ceil(protectedRecoveryMaxSealedBytes/3);
