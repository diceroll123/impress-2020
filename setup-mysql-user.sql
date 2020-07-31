-- Public data tables: read
GRANT SELECT ON openneo_impress.colors TO impress2020;
GRANT SELECT ON openneo_impress.color_translations TO impress2020;
GRANT SELECT ON openneo_impress.items TO impress2020;
GRANT SELECT ON openneo_impress.item_translations TO impress2020;
GRANT SELECT ON openneo_impress.parents_swf_assets TO impress2020;
GRANT SELECT ON openneo_impress.pet_types TO impress2020;
GRANT SELECT ON openneo_impress.pet_states TO impress2020;
GRANT SELECT ON openneo_impress.species TO impress2020;
GRANT SELECT ON openneo_impress.species_translations TO impress2020;
GRANT SELECT ON openneo_impress.swf_assets TO impress2020;
GRANT SELECT ON openneo_impress.zones TO impress2020;
GRANT SELECT ON openneo_impress.zone_translations TO impress2020;

-- Public data tables: write
GRANT UPDATE ON openneo_impress.items TO impress2020;
GRANT UPDATE ON openneo_impress.swf_assets TO impress2020;

-- User data tables
GRANT SELECT ON openneo_impress.item_outfit_relationships TO impress2020;
GRANT SELECT ON openneo_impress.outfits TO impress2020;
