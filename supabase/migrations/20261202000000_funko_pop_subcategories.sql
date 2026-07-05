-- Migration: Add Funko Pop! Subcategories
-- Date: 2026-07-02

DO $$
DECLARE
  v_parent_id UUID;
BEGIN
  -- Get the parent category ID for 'Funko POP'
  SELECT id INTO v_parent_id FROM public.categories WHERE slug = 'funko-pop';
  
  IF v_parent_id IS NULL THEN
    RAISE EXCEPTION 'Parent category "Funko POP" (slug "funko-pop") not found. Please ensure it exists before running this migration.';
  END IF;

  -- Insert/update the subcategories under 'Funko POP'
  INSERT INTO public.categories (name, slug, parent_id, is_active, status) VALUES
    ('Funko Pop! Animation', 'funko-pop-animation', v_parent_id, true, 'approved'),
    ('Funko Pop! Anime', 'funko-pop-anime', v_parent_id, true, 'approved'),
    ('Funko Pop! Movies', 'funko-pop-movies', v_parent_id, true, 'approved'),
    ('Funko Pop! Television', 'funko-pop-television', v_parent_id, true, 'approved'),
    ('Funko Pop! Marvel', 'funko-pop-marvel', v_parent_id, true, 'approved'),
    ('Funko Pop! DC Comics', 'funko-pop-dc-comics', v_parent_id, true, 'approved'),
    ('Funko Pop! Star Wars', 'funko-pop-star-wars', v_parent_id, true, 'approved'),
    ('Funko Pop! Disney', 'funko-pop-disney', v_parent_id, true, 'approved'),
    ('Funko Pop! Pixar', 'funko-pop-pixar', v_parent_id, true, 'approved'),
    ('Funko Pop! Harry Potter', 'funko-pop-harry-potter', v_parent_id, true, 'approved'),
    ('Funko Pop! Games', 'funko-pop-games', v_parent_id, true, 'approved'),
    ('Funko Pop! Pokémon', 'funko-pop-pokemon', v_parent_id, true, 'approved'),
    ('Funko Pop! Horror', 'funko-pop-horror', v_parent_id, true, 'approved'),
    ('Funko Pop! Rocks', 'funko-pop-rocks', v_parent_id, true, 'approved'),
    ('Funko Pop! Sports', 'funko-pop-sports', v_parent_id, true, 'approved'),
    ('Funko Pop! Ad Icons', 'funko-pop-ad-icons', v_parent_id, true, 'approved'),
    ('Funko Pop! Retro Toys', 'funko-pop-retro-toys', v_parent_id, true, 'approved'),
    ('Funko Pop! Comic Covers', 'funko-pop-comic-covers', v_parent_id, true, 'approved'),
    ('Funko Pop! Movie Posters', 'funko-pop-movie-posters', v_parent_id, true, 'approved'),
    ('Funko Pop! Albums', 'funko-pop-albums', v_parent_id, true, 'approved'),
    ('Funko Pop! Rides', 'funko-pop-rides', v_parent_id, true, 'approved'),
    ('Funko Pop! Town', 'funko-pop-town', v_parent_id, true, 'approved'),
    ('Funko Pop! Deluxe', 'funko-pop-deluxe', v_parent_id, true, 'approved'),
    ('Funko Pop! Moments', 'funko-pop-moments', v_parent_id, true, 'approved'),
    ('Funko Pop! Holiday', 'funko-pop-holiday', v_parent_id, true, 'approved'),
    ('Funko Pop! Art Series', 'funko-pop-art-series', v_parent_id, true, 'approved'),
    ('Funko Pop! Jumbo (10")', 'funko-pop-jumbo-10', v_parent_id, true, 'approved'),
    ('Funko Pop! Mega (18")', 'funko-pop-mega-18', v_parent_id, true, 'approved')
  ON CONFLICT (slug) DO UPDATE SET
    parent_id = EXCLUDED.parent_id,
    name = EXCLUDED.name,
    is_active = EXCLUDED.is_active,
    status = EXCLUDED.status;
END $$;
