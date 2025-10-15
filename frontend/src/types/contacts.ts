export interface ContactCore {
  id: string;
  fullName: string;
  title: string;
  department?: string;
  seniority?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  confidence?: number;
  isPrimary?: boolean;
}

