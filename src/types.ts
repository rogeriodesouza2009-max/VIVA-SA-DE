export type MealPeriod = 'JEJUM' | 'APOS CAFÉ' | 'APOS ALMOÇO' | 'APOS JANTAR';

export interface HealthReading {
  id?: string;
  glucose: number;
  systolic: number;
  diastolic: number;
  bpm: number;
  period?: MealPeriod;
  userId: string;
  createdAt: any; // Firestore Timestamp
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export enum HealthStatus {
  GREAT = 'GREAT',
  ATTENTION = 'ATTENTION',
  DANGER = 'DANGER'
}

export type OperationType = 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}
