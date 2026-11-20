-- Run as postgres after apply-booking-requests.sql. pg_cron must be installed.
-- The named job is upserted on repeat execution.
SELECT cron.schedule(
 'emnos-vencer-solicitudes',
 '* * * * *',
 'SELECT mymind.vencer_solicitudes();'
);
SELECT jobid,jobname,schedule,active FROM cron.job WHERE jobname='emnos-vencer-solicitudes';
