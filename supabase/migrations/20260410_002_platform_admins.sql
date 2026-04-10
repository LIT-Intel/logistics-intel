-- Migration: platform_admins table for superadmin (platform-level, separate from org roles)

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can only read their own row
CREATE POLICY "Users can read own platform_admins row"
  ON platform_admins
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Bootstrap the first superadmin by email lookup
INSERT INTO platform_admins (user_id)
SELECT id FROM auth.users
WHERE email = 'vraymond@sparkfusiondigital.com'
ON CONFLICT (user_id) DO NOTHING;
