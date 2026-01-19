import { ObjectId } from 'mongodb';

// ═══════════════════════════════════════════════════════════
// Holder Model - Normalized (one doc per holder per week)
// ═══════════════════════════════════════════════════════════

export interface Holder {
  _id?: ObjectId;
  weekId: string;
  snapshotId: ObjectId;
  address: string;
  balance: string;
  balanceFormatted: string;
  isContract: boolean;
  label?: string | undefined;
  entity?: string | undefined;
  createdAt: Date;
}

export interface CreateHolderInput {
  weekId: string;
  snapshotId: ObjectId;
  address: string;
  balance: string;
  balanceFormatted: string;
  isContract?: boolean;
  label?: string | undefined;
  entity?: string | undefined;
}

export interface MoralisHolderResponse {
  owner_address: string;
  owner_address_label?: string;
  balance: string;
  balance_formatted: string;
  is_contract: string | boolean;
  entity?: string;
  entity_logo?: string;
  usd_value?: string;
  percentage_relative_to_total_supply?: number;
}

// ═══════════════════════════════════════════════════════════
// Factory functions
// ═══════════════════════════════════════════════════════════

export function createHolder(input: CreateHolderInput): Holder {
  return {
    weekId: input.weekId,
    snapshotId: input.snapshotId,
    address: input.address.toLowerCase(),
    balance: input.balance,
    balanceFormatted: input.balanceFormatted,
    isContract: input.isContract ?? false,
    label: input.label,
    entity: input.entity,
    createdAt: new Date(),
  };
}

export function fromMoralisResponse(
  response: MoralisHolderResponse,
  weekId: string,
  snapshotId: ObjectId
): Holder {
  return createHolder({
    weekId,
    snapshotId,
    address: response.owner_address.toLowerCase(),
    balance: response.balance,
    balanceFormatted: response.balance_formatted,
    isContract: response.is_contract === true || response.is_contract === 'true',
    label: response.owner_address_label,
    entity: response.entity,
  });
}
