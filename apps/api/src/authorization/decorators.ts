import { SetMetadata } from '@nestjs/common';

export const SENSITIVE_MUTATION_KEY = 'ms:sensitive-mutation';

/**
 * Marks a route as a privileged mutation: administrator status, roles, direct
 * permissions, role state, role permissions or session revocation. Those routes
 * carry a tighter ceiling than ordinary admin work (SRS SEC 003), applied by
 * `SensitiveThrottleGuard` after authorization has already allowed the request.
 */
export const SensitiveMutation = () => SetMetadata(SENSITIVE_MUTATION_KEY, true);
