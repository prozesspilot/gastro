/**
 * E2E-Helper: seedProfile (Wrapper um createTestCustomer mit ID-Reuse).
 */

import type { Pool } from 'pg';
import { createTestCustomer, type TestCustomerOpts } from './create-test-customer';

export async function seedProfile(
  pool: Pool,
  customerId: string,
  opts: Omit<TestCustomerOpts, 'customerId'>,
) {
  return createTestCustomer(pool, { ...opts, customerId });
}
