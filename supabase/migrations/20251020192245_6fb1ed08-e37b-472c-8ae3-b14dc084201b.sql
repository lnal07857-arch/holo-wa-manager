-- Add display_order column to message_templates table
ALTER TABLE public.message_templates 
ADD COLUMN display_order INTEGER DEFAULT 0;

-- Update existing templates with sequential order
WITH ordered_templates AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) as row_num
  FROM public.message_templates
)
UPDATE public.message_templates
SET display_order = (SELECT row_num FROM ordered_templates WHERE ordered_templates.id = message_templates.id);