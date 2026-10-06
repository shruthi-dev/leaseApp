-- Machine-readable reason for a failed lease (e.g. 'no_text', 'api_key_missing'). The UI translates
-- it into the user's language; error_message keeps the original technical detail.
alter table public.leases add column error_code text;

-- Backfill codes for failures recorded before codes existed, so they display translated too.
update public.leases set error_code = case
    when error_message like 'The Claude API key is not configured%' then 'api_key_missing'
    when error_message = 'The Claude API key was rejected.' then 'api_key_rejected'
    when error_message like 'Claude is rate limiting%' then 'rate_limited'
    when error_message like 'Claude API error%' then 'claude_api_error'
    when error_message = 'Claude declined to analyze this document.' then 'claude_refused'
    when error_message like 'Claude ran out of output tokens%' then 'claude_incomplete'
    when error_message like 'Claude returned a response that did not match%' then 'claude_bad_output'
    when error_message like 'No selectable text found%' or error_message = 'No text was extracted from this PDF.' then 'no_text'
    when error_message like 'This lease is too long%' then 'too_long'
    when error_message like 'The file never finished uploading%' then 'upload_incomplete'
    when error_message like 'Could not save the results%' then 'save_failed'
  end
where status = 'failed' and error_code is null and error_message is not null;
