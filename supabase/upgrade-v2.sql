-- GENERATED additive upgrade from the reviewed eleven-migration installation.
-- Existing DEVELOPMENT database only. Includes matching Drizzle history; no passwords.
BEGIN;
SET LOCAL search_path=public;
DO $$ BEGIN IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN RAISE EXCEPTION 'Existing installation required; use fresh-install.sql for a new database'; END IF; END $$;
LOCK TABLE drizzle.__drizzle_migrations IN EXCLUSIVE MODE;
DO $$ BEGIN
 IF (SELECT array_agg(hash ORDER BY created_at,id) FROM drizzle.__drizzle_migrations) IS DISTINCT FROM ARRAY['616e333cd0ee22cb61f5e78244ceee39ca6ff374b9379cbba26f54c832cfe316','4acb3b56e0d6cd8181410f0eca0187a4874cf1eaed609ca1721cd429304d752f','4d60bdbc3a2cb64f202132b685862f74b966955eca83447d4c357d1c4c20df3d','0edf1e543c578bf197742ee074ea2d284fb534fafb68cb85bf1ed7f664496b6d','843c5287907c82d2a2b6f27c9a156535b11da8d0f62194395ba4b88b491a8fe7','421fb1e395f72dfc2717081e223ba975f2b0d33c4afb19831b312807443684ad','c624075684a5d5b211b23bff460e032ec9584929cd64aba155ada3e3fdb53aea','a14ecdc31f5c757c5a053467b1db0ce6d64dce674aad5ba2da77e9589d734d8a','f9b20099b2ddabd016d82d37c45347920d068d6b5450ba770782d66661cc4ff5','c0252f6bf561946da1bdfd1be16fb1e4e9c07cfbc3d3969d3a0e8ce7fa71ffda','9fbd0cc7eccd152288dbae10aeb9af6de397e8924d999fbaf3db24983d2ce99c']::text[] THEN
  RAISE EXCEPTION 'Migration history differs or upgrade already applied; no changes performed';
 END IF;
END $$;

-- 0011_schema_v2
-- Additive v2 storage and publication metadata. No existing content JSON is rewritten.
ALTER TYPE public.asset_kind ADD VALUE IF NOT EXISTS 'animation';

ALTER TABLE public.asset ADD COLUMN private_storage boolean NOT NULL DEFAULT false;
ALTER TABLE public.asset ADD COLUMN current_version_id text;
ALTER TABLE public.chapter ADD COLUMN published_version_id text;
ALTER TABLE public.chapter ADD COLUMN draft_asset_pins jsonb;
ALTER TABLE public.course_version ADD COLUMN asset_manifest jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE public.asset_version (
 id text PRIMARY KEY, asset_id text NOT NULL REFERENCES public.asset(id) ON DELETE CASCADE,
 version_no integer NOT NULL CHECK(version_no > 0), content_identity text NOT NULL, filename text NOT NULL, mime text NOT NULL,
 size_bytes integer NOT NULL CHECK(size_bytes >= 0), storage_key text NOT NULL, normalized_key text,
 private_storage boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready')),
 metadata jsonb NOT NULL, created_by text REFERENCES public."user"(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT asset_version_number_idx UNIQUE(asset_id, version_no), CONSTRAINT asset_version_identity_idx UNIQUE(id,asset_id)
);
ALTER TABLE public.asset ADD CONSTRAINT asset_current_version_fk FOREIGN KEY(current_version_id,id) REFERENCES public.asset_version(id,asset_id) DEFERRABLE INITIALLY DEFERRED;

-- Existing assets get immutable metadata records; rights/reviews remain unknown, never fabricated.
INSERT INTO public.asset_version(id,asset_id,version_no,content_identity,filename,mime,size_bytes,storage_key,private_storage,status,metadata,created_by,created_at)
SELECT 'av-legacy-' || id,id,1,'legacy-' || id,filename,mime,size_bytes,storage_key,false,status::text,
 jsonb_build_object('altText',alt_text,'source','','licenseType','unknown','commercialUseAllowed',NULL,'creditRequired',false,'creditText','','editingAllowed',NULL,'medicalStatus','draft'),uploaded_by,created_at
FROM public.asset;
UPDATE public.asset SET current_version_id='av-legacy-' || id;

CREATE TABLE public.chapter_version (
 id text PRIMARY KEY, chapter_id text NOT NULL REFERENCES public.chapter(id) ON DELETE CASCADE,
 version_no integer NOT NULL CHECK(version_no > 0), content jsonb NOT NULL, content_hash text NOT NULL,
 asset_manifest jsonb NOT NULL, published_by text REFERENCES public."user"(id) ON DELETE SET NULL,
 published_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT chapter_version_number_idx UNIQUE(chapter_id,version_no), CONSTRAINT chapter_version_identity_idx UNIQUE(id,chapter_id)
);
ALTER TABLE public.chapter ADD CONSTRAINT chapter_published_version_fk FOREIGN KEY(published_version_id,id) REFERENCES public.chapter_version(id,chapter_id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.screen_review (
 id text PRIMARY KEY, seq bigserial NOT NULL UNIQUE, chapter_id text NOT NULL REFERENCES public.chapter(id) ON DELETE CASCADE,
 screen_id text NOT NULL, content_hash text NOT NULL, status text NOT NULL CHECK(status IN ('approved','rejected')),
 reviewed_by text NOT NULL REFERENCES public."user"(id), reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(), note text NOT NULL DEFAULT ''
);
CREATE INDEX screen_review_content_idx ON public.screen_review(chapter_id,screen_id,content_hash);

CREATE TABLE public.device_model (
 id text PRIMARY KEY, name text NOT NULL, manufacturer text NOT NULL,
 device_type text NOT NULL CHECK(device_type IN ('semi_automatic','fully_automatic')), manual_url text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','verified')),
 verified_by text REFERENCES public."user"(id), verified_at timestamptz, evidence jsonb,
 created_by text REFERENCES public."user"(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT device_model_verified_evidence CHECK(status <> 'verified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL AND coalesce(evidence->>'guideReviewed'='true',false) AND coalesce(evidence->>'trainerTested'='true',false)))
);

CREATE FUNCTION public.mozes_v2_immutable_version() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_TABLE_NAME='asset_version' THEN
  IF OLD.status='pending' THEN RETURN NEW; END IF;
  IF NEW.created_by IS NULL AND (to_jsonb(NEW)-'created_by')=(to_jsonb(OLD)-'created_by') THEN RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='chapter_version' THEN
  IF NEW.published_by IS NULL AND (to_jsonb(NEW)-'published_by')=(to_jsonb(OLD)-'published_by') THEN RETURN NEW; END IF;
 END IF;
 RAISE EXCEPTION 'Published or ready versions are immutable; create a new version';
END $$;
REVOKE ALL ON FUNCTION public.mozes_v2_immutable_version() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mozes_v2_immutable_version() TO mozes_app;
CREATE TRIGGER asset_version_immutable BEFORE UPDATE ON public.asset_version FOR EACH ROW EXECUTE FUNCTION public.mozes_v2_immutable_version();
CREATE TRIGGER chapter_version_immutable BEFORE UPDATE ON public.chapter_version FOR EACH ROW EXECUTE FUNCTION public.mozes_v2_immutable_version();

ALTER TABLE public.asset_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screen_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_model ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.asset_version,public.chapter_version,public.screen_review,public.device_model FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.screen_review_seq_seq FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON public.asset_version TO mozes_app;
GRANT SELECT,INSERT ON public.chapter_version,public.screen_review TO mozes_app;
GRANT SELECT,INSERT,UPDATE ON public.device_model TO mozes_app;
GRANT USAGE ON SEQUENCE public.screen_review_seq_seq TO mozes_app;
CREATE POLICY mozes_server_only ON public.asset_version FOR ALL TO mozes_app USING(true) WITH CHECK(true);
CREATE POLICY mozes_server_only ON public.chapter_version FOR ALL TO mozes_app USING(true) WITH CHECK(true);
CREATE POLICY mozes_server_only ON public.screen_review FOR ALL TO mozes_app USING(true) WITH CHECK(true);
CREATE POLICY mozes_server_only ON public.device_model FOR ALL TO mozes_app USING(true) WITH CHECK(true);
DO $$ DECLARE r text; t text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   FOREACH t IN ARRAY ARRAY['asset_version','chapter_version','screen_review','device_model'] LOOP EXECUTE format('REVOKE ALL ON public.%I FROM %I',t,r); END LOOP;
   EXECUTE format('REVOKE ALL ON SEQUENCE public.screen_review_seq_seq FROM %I',r);
  END IF;
 END LOOP;
END $$;

INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES('1998cceecece7c6deac6b7a529296dfda961838a4e8c0e89e585576a857c2465',1793613600002);
COMMIT;
