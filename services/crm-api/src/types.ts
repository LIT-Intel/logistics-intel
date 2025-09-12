export type Company = {
  id: number;
  name: string;
  website?: string;
  plan: 'Free'|'Pro'|'Enterprise';
  external_ref?: string;
};
