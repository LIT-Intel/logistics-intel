declare module '@/auth/firebaseClient' {
  export const auth: {
    currentUser?: {
      getIdToken?: (forceRefresh?: boolean) => Promise<string>;
    } | null;
  } | null;
}

