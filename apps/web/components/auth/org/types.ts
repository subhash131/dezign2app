export interface OrgItem {
  id: string;
  name: string;
  slug?: string;
}

export interface OrgSeatStatus {
  totalSeats: number;
  extraSeats: number;
  baseSeats: number;
  usedSeats: number;
  memberCount: number;
  pendingInviteCount: number;
  availableSeats: number;
  canInvite: boolean;
  isOwner: boolean;
  status: string;
}
