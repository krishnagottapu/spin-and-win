import type { Session, Participant, Prize, Staff } from '@/lib/types';

it('types module exports correctly', () => {
  // Type-level test — if this file compiles, types are valid
  // The import above verifies the module exports these types
  const typeCheck: boolean = true;
  expect(typeCheck).toBe(true);
});

it('Session type has required fields', () => {
  // Compile-time verification of Session shape
  type AssertSession = Session extends {
    id: string;
    event_name: string;
    slug: string;
    status: string;
  }
    ? true
    : never;
  const check: AssertSession = true;
  expect(check).toBe(true);
});

it('Participant type has required fields', () => {
  // Compile-time verification of Participant shape
  type AssertParticipant = Participant extends {
    id: string;
    session_id: string;
    name: string;
    phone: string;
    status: string;
  }
    ? true
    : never;
  const check: AssertParticipant = true;
  expect(check).toBe(true);
});

it('Prize type has required fields', () => {
  // Compile-time verification of Prize shape
  type AssertPrize = Prize extends {
    id: string;
    session_id: string;
    name: string;
    weight: number;
    inventory_count: number;
  }
    ? true
    : never;
  const check: AssertPrize = true;
  expect(check).toBe(true);
});

it('Staff type has required fields', () => {
  // Compile-time verification of Staff shape
  type AssertStaff = Staff extends {
    id: string;
    session_id: string;
    name: string;
    invite_code: string;
  }
    ? true
    : never;
  const check: AssertStaff = true;
  expect(check).toBe(true);
});
