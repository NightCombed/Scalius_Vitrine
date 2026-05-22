alter table store_settings
  add column if not exists melhorenvio_sandbox boolean not null default false;
