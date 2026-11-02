export const REVIEWER = 'reviewer';
export const ENGINEER = 'engineer';
export const ADMIN = 'admin';
export const SUPERADMIN = 'superadmin';

export const CERTIFIED_ROLES = [REVIEWER, ENGINEER, ADMIN];
export const INVOCATION_ROLES = [SUPERADMIN, ENGINEER];
/** Load and farm simulations: started only by a superadmin, from the throughput scripts. */
export const STRESS_INVOCATION_ROLES = [SUPERADMIN];
