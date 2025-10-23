-- Create public bucket for WhatsApp media files
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media', 'whatsapp-media', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public read whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Users can update whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete whatsapp media" ON storage.objects;

-- Public read access for media files
CREATE POLICY "Public read whatsapp media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'whatsapp-media');

-- Authenticated users can upload media
CREATE POLICY "Users can upload whatsapp media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'whatsapp-media' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "Users can update whatsapp media"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'whatsapp-media' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "Users can delete whatsapp media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'whatsapp-media' AND
    auth.role() = 'authenticated'
  );