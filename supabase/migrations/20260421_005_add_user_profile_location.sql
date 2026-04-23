-- Add location column to user_profiles (frontend reads/writes this field but column was missing)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS location text;
