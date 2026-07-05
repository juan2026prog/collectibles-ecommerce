-- Migration: Funko Pop Rules and Learning
-- Date: 2026-07-02

-- 1. Real-time view for category published product counts (Fase 11)
CREATE OR REPLACE VIEW public.categories_with_published_counts AS
SELECT c.*,
       COALESCE(
         (SELECT COUNT(DISTINCT p.id)
          FROM public.products p
          LEFT JOIN public.product_categories pc ON pc.product_id = p.id
          WHERE (p.category_id = c.id OR pc.category_id = c.id) 
            AND p.status = 'published' 
            AND p.is_active = true),
         0
       )::integer AS published_products_count
FROM public.categories c;

-- 2. Trigger function to keep product_categories in sync with products.category_id (Fase 5)
CREATE OR REPLACE FUNCTION public.sync_product_primary_category()
RETURNS TRIGGER AS $$
BEGIN
  -- If category_id changed or was inserted
  IF (TG_OP = 'INSERT' AND NEW.category_id IS NOT NULL) OR 
     (TG_OP = 'UPDATE' AND OLD.category_id IS DISTINCT FROM NEW.category_id) THEN
     
    -- Remove the old primary category from product_categories if it was changed
    IF TG_OP = 'UPDATE' AND OLD.category_id IS NOT NULL THEN
      DELETE FROM public.product_categories 
      WHERE product_id = OLD.id AND category_id = OLD.category_id;
    END IF;
    
    -- Insert the new primary category if not already present
    IF NEW.category_id IS NOT NULL THEN
      INSERT INTO public.product_categories (product_id, category_id)
      VALUES (NEW.id, NEW.category_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on products
DROP TRIGGER IF EXISTS tr_sync_product_primary_category ON public.products;
CREATE TRIGGER tr_sync_product_primary_category
AFTER INSERT OR UPDATE OF category_id ON public.products
FOR EACH ROW EXECUTE FUNCTION public.sync_product_primary_category();

-- Backfill existing products primary category assignments to product_categories
INSERT INTO public.product_categories (product_id, category_id)
SELECT id, category_id 
FROM public.products 
WHERE category_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. Helper to extract Funko subject (character/universe) from title
CREATE OR REPLACE FUNCTION public.extract_funko_subject(p_title text)
RETURNS text AS $$
DECLARE
  v_title text := lower(p_title);
  v_words text[];
  v_word text;
  v_pop_idx integer := 0;
BEGIN
  -- Remove punctuation
  v_title := regexp_replace(v_title, '[!\(\)"\-\.,]', ' ', 'g');
  -- Split into array of words
  v_words := regexp_split_to_array(v_title, '\s+');
  
  -- Find the index of "pop"
  FOR i IN 1..array_length(v_words, 1) LOOP
    IF v_words[i] = 'pop' THEN
      v_pop_idx := i;
      EXIT;
    END IF;
  END LOOP;
  
  -- Look for the first word after "pop" that is not a noise/stop word
  IF v_pop_idx > 0 AND v_pop_idx < array_length(v_words, 1) THEN
    FOR i IN (v_pop_idx + 1)..array_length(v_words, 1) LOOP
      v_word := trim(v_words[i]);
      IF v_word <> '' AND v_word NOT IN (
        'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'o',
        'the', 'a', 'an', 'and', 'with', 'in', 'on', 'at', 'for', 'of',
        'jumbo', 'mega', 'chase', 'special', 'edition', 'edición', 'especial',
        'exclusivo', 'exclusive', 'pack', 'set', 'pocket', 'keychain', 'llavero'
      ) THEN
        RETURN v_word; -- Return the first descriptive word
      END IF;
    END LOOP;
  END IF;
  
  -- Fallback to the first word that isn't 'funko' or 'pop'
  FOR i IN 1..array_length(v_words, 1) LOOP
    v_word := trim(v_words[i]);
    IF v_word <> '' AND v_word NOT IN ('funko', 'pop') THEN
      RETURN v_word;
    END IF;
  END LOOP;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 4. Inductive learning trigger function for Funko subcategories (Fase 3 & 4)
CREATE OR REPLACE FUNCTION public.learn_funko_pop_category()
RETURNS TRIGGER AS $$
DECLARE
  v_parent_id UUID;
  v_word text;
  v_dict_id UUID;
  v_dict_name text;
  v_subcat_name text;
  v_similar_count integer := 0;
  v_similar_titles text := '';
  v_rec RECORD;
BEGIN
  -- Skip if no category assigned
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get parent category info
  SELECT parent_id, name INTO v_parent_id, v_subcat_name 
  FROM public.categories 
  WHERE id = NEW.category_id;
  
  -- Only learn if the category is a subcategory of Funko POP (parent_id is the Funko POP category ID)
  IF v_parent_id = '94c47727-f07d-4c80-b74d-eb8344c8ddeb' THEN
    v_word := public.extract_funko_subject(NEW.title);
    
    IF v_word IS NOT NULL AND length(v_word) >= 3 THEN
      -- Dictionary name format: FUNKO_[SUBCATEGORY_SLUG]
      v_dict_name := 'FUNKO_' || upper(regexp_replace((SELECT slug FROM public.categories WHERE id = NEW.category_id), '[^a-zA-Z0-9]', '_', 'g'));
      
      SELECT id INTO v_dict_id FROM public.taxonomy_dictionaries WHERE name = v_dict_name LIMIT 1;
      
      -- Create dictionary if not exists
      IF v_dict_id IS NULL THEN
        INSERT INTO public.taxonomy_dictionaries (name, description, category_id)
        VALUES (v_dict_name, 'Diccionario auto-aprendido para ' || v_subcat_name, NEW.category_id)
        RETURNING id INTO v_dict_id;
        
        -- Also create the corresponding taxonomy rule
        INSERT INTO public.taxonomy_rules (priority, rule_type, scope, condition_field, condition_value, action_type, action_target_id, is_active, logical_operator, conditions)
        VALUES (
          95,
          'keyword',
          'global',
          'dictionary',
          v_dict_name,
          'set_category',
          NEW.category_id,
          true,
          'AND',
          jsonb_build_array(jsonb_build_object('field', 'dictionary', 'value', v_dict_name, 'operator', 'equals'))
        );
      END IF;
      
      -- Insert word into dictionary if not exists
      IF NOT EXISTS (SELECT 1 FROM public.taxonomy_dictionary_words WHERE dictionary_id = v_dict_id AND lower(word) = lower(v_word)) THEN
        INSERT INTO public.taxonomy_dictionary_words (dictionary_id, word)
        VALUES (v_dict_id, lower(v_word));
        
        -- Find similar uncategorized products (in 'Funko POP' parent category, not in subcategory)
        FOR v_rec IN 
          SELECT title 
          FROM public.products 
          WHERE category_id = '94c47727-f07d-4c80-b74d-eb8344c8ddeb' 
            AND lower(title) LIKE concat('%', lower(v_word), '%')
            AND id <> NEW.id
          LIMIT 5
        LOOP
          v_similar_count := v_similar_count + 1;
          v_similar_titles := v_similar_titles || v_rec.title || ', ';
        END LOOP;
        
        -- If similar products found, trigger an admin alert
        IF v_similar_count > 0 THEN
          v_similar_titles := trim(trailing ', ' from v_similar_titles);
          INSERT INTO public.admin_alerts (title, description, type, is_read)
          VALUES (
            'Aprendizaje de Catalogación: ' || v_subcat_name,
            concat('Se aprendió la palabra clave "', v_word, '" para la categoría "', v_subcat_name, '". Se detectaron ', v_similar_count, ' productos similares sin clasificar: ', v_similar_titles),
            'info',
            false
          );
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach learn trigger on products
DROP TRIGGER IF EXISTS tr_learn_funko_pop_category ON public.products;
CREATE TRIGGER tr_learn_funko_pop_category
AFTER UPDATE OF category_id ON public.products
FOR EACH ROW
WHEN (OLD.category_id IS DISTINCT FROM NEW.category_id AND NEW.category_id IS NOT NULL)
EXECUTE FUNCTION public.learn_funko_pop_category();

-- 5. Seed dictionaries and rules for Funko subcategories
DO $$
DECLARE
  v_subcat RECORD;
  v_dict_id UUID;
  v_dict_name text;
BEGIN
  FOR v_subcat IN 
    SELECT id, name, slug 
    FROM public.categories 
    WHERE parent_id = '94c47727-f07d-4c80-b74d-eb8344c8ddeb'
  LOOP
    v_dict_name := 'FUNKO_' || upper(regexp_replace(v_subcat.slug, '[^a-zA-Z0-9]', '_', 'g'));
    
    -- Check if dictionary already exists
    SELECT id INTO v_dict_id FROM public.taxonomy_dictionaries WHERE name = v_dict_name;
    
    IF v_dict_id IS NULL THEN
      INSERT INTO public.taxonomy_dictionaries (name, description, category_id)
      VALUES (v_dict_name, 'Diccionario inteligente para ' || v_subcat.name, v_subcat.id)
      RETURNING id INTO v_dict_id;
      
      -- Create global rule for this dictionary
      INSERT INTO public.taxonomy_rules (priority, rule_type, scope, condition_field, condition_value, action_type, action_target_id, is_active, logical_operator, conditions)
      VALUES (
        95,
        'keyword',
        'global',
        'dictionary',
        v_dict_name,
        'set_category',
        v_subcat.id,
        true,
        'AND',
        jsonb_build_array(jsonb_build_object('field', 'dictionary', 'value', v_dict_name, 'operator', 'equals'))
      );
    END IF;
    
    -- Seed initial keywords for key categories
    IF v_subcat.slug = 'funko-pop-anime' THEN
      INSERT INTO public.taxonomy_dictionary_words (dictionary_id, word) VALUES
        (v_dict_id, 'naruto'), (v_dict_id, 'goku'), (v_dict_id, 'luffy'), (v_dict_id, 'zoro'),
        (v_dict_id, 'demon slayer'), (v_dict_id, 'tanjiro'), (v_dict_id, 'nezuko'), (v_dict_id, 'deku'),
        (v_dict_id, 'dragon ball'), (v_dict_id, 'one piece'), (v_dict_id, 'bleach'), (v_dict_id, 'shingeki'),
        (v_dict_id, 'attack on titan'), (v_dict_id, 'sasuke'), (v_dict_id, 'vegeta'), (v_dict_id, 'itachi')
      ON CONFLICT DO NOTHING;
    ELSIF v_subcat.slug = 'funko-pop-marvel' THEN
      INSERT INTO public.taxonomy_dictionary_words (dictionary_id, word) VALUES
        (v_dict_id, 'marvel'), (v_dict_id, 'iron man'), (v_dict_id, 'spider-man'), (v_dict_id, 'spiderman'),
        (v_dict_id, 'thor'), (v_dict_id, 'hulk'), (v_dict_id, 'wolverine'), (v_dict_id, 'deadpool'),
        (v_dict_id, 'groot'), (v_dict_id, 'avengers'), (v_dict_id, 'captain america'), (v_dict_id, 'loki')
      ON CONFLICT DO NOTHING;
    ELSIF v_subcat.slug = 'funko-pop-dc-comics' THEN
      INSERT INTO public.taxonomy_dictionary_words (dictionary_id, word) VALUES
        (v_dict_id, 'batman'), (v_dict_id, 'superman'), (v_dict_id, 'joker'), (v_dict_id, 'harley quinn'),
        (v_dict_id, 'wonder woman'), (v_dict_id, 'flash'), (v_dict_id, 'dc comics'), (v_dict_id, 'aquaman')
      ON CONFLICT DO NOTHING;
    ELSIF v_subcat.slug = 'funko-pop-star-wars' THEN
      INSERT INTO public.taxonomy_dictionary_words (dictionary_id, word) VALUES
        (v_dict_id, 'star wars'), (v_dict_id, 'darth vader'), (v_dict_id, 'yoda'), (v_dict_id, 'mandalorian'),
        (v_dict_id, 'grogu'), (v_dict_id, 'luke skywalker'), (v_dict_id, 'boba fett'), (v_dict_id, 'obi-wan')
      ON CONFLICT DO NOTHING;
    ELSIF v_subcat.slug = 'funko-pop-disney' THEN
      INSERT INTO public.taxonomy_dictionary_words (dictionary_id, word) VALUES
        (v_dict_id, 'mickey'), (v_dict_id, 'minnie'), (v_dict_id, 'stitch'), (v_dict_id, 'disney'),
        (v_dict_id, 'frozen'), (v_dict_id, 'elsa'), (v_dict_id, 'olaf'), (v_dict_id, 'ariel'), (v_dict_id, 'bambi')
      ON CONFLICT DO NOTHING;
    ELSIF v_subcat.slug = 'funko-pop-pokemon' THEN
      INSERT INTO public.taxonomy_dictionary_words (dictionary_id, word) VALUES
        (v_dict_id, 'pokemon'), (v_dict_id, 'pokémon'), (v_dict_id, 'pikachu'), (v_dict_id, 'charizard'),
        (v_dict_id, 'bulbasaur'), (v_dict_id, 'squirtle'), (v_dict_id, 'charmander'), (v_dict_id, 'eevee')
      ON CONFLICT DO NOTHING;
    ELSIF v_subcat.slug = 'funko-pop-horror' THEN
      INSERT INTO public.taxonomy_dictionary_words (dictionary_id, word) VALUES
        (v_dict_id, 'horror'), (v_dict_id, 'terror'), (v_dict_id, 'freddy krueger'), (v_dict_id, 'jason voorhees'),
        (v_dict_id, 'pennywise'), (v_dict_id, 'chucky'), (v_dict_id, 'michael myers'), (v_dict_id, 'it')
      ON CONFLICT DO NOTHING;
    ELSIF v_subcat.slug = 'funko-pop-movies' THEN
      INSERT INTO public.taxonomy_dictionary_words (dictionary_id, word) VALUES
        (v_dict_id, 'jurassic park'), (v_dict_id, 'jurassic world'), (v_dict_id, 'lord of the rings'),
        (v_dict_id, 'back to the future'), (v_dict_id, 'ghostbusters'), (v_dict_id, 'rocky'), (v_dict_id, 'john wick')
      ON CONFLICT DO NOTHING;
    ELSIF v_subcat.slug = 'funko-pop-television' THEN
      INSERT INTO public.taxonomy_dictionary_words (dictionary_id, word) VALUES
        (v_dict_id, 'friends'), (v_dict_id, 'stranger things'), (v_dict_id, 'the office'),
        (v_dict_id, 'game of thrones'), (v_dict_id, 'breaking bad'), (v_dict_id, 'the walking dead')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;
