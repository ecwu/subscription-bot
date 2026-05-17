export interface StoredUserProfile {
  userKey: string;
  encryptedPayload: string;
  createdAt: string;
  updatedAt: string;
}

export interface DecryptedUserProfile {
  chatId: number | string;
  firstSeenAt: string;
  lastSeenAt: string;
}
