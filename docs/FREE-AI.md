# مساعد Cloudflare المجاني

خدمة مستقلة عن مكنة؛ لا تغيّر العاملالموجودلمكنة. `worker/index.js` يحتوي مصدرها ويمكن نشر نسخة خاصة باستخدام `npx wrangler deploy --config worker/wrangler.toml` بحسابالمراجع إذا أراد.

الافتراضي: `https://sarj-qa-free-ai.moknah-erp.workers.dev/v1/chat/completions`، يستدعيه خادمASP.NETفقط. لا مفتاحمالكفيالمستودع. خدمةتجريبيةمشتركةوليست خدمةمدفوعةأومضمونةالتوفر.

- النص: Llama3.3-70B FP8 Fast. الصور: Llama4Scout. اختيارالنموذجخادميثابت، لايوجدproxyلمزودأوموقعكيفماكان.
-20محاولة يوميًا للخدمةكلهامشتركة، وليس لكلشخص، بعدادDurableObjectذري. المحاولةالفاشلةتحسب أيضًا.3ثوانبينالطلبات؛ حجم3MBوصورتانبحدأقصى، كلصورةdataURLأقلمن1.2MB؛ النص18kحرفوالناتج1800token. تجاوزالحديرجع429، بلاfallbackمدفوع.
- Cloudflare تمنح10,000Neuronمجانيةيوميًا؛عندنفادحصتهاقدتفشلالعملياتحتىلوعدادالتجربةلميمتلئ. لايدعيالمنتجمجانيةلامحدودةولايفعّلترقيةخطةأوفوترة.
- لا تحفظالخدمةمصادركفيقاعدةبياناتهاولاتسجلهاأومفاتيحها؛ العدادفقطمحفوظ. تظلCloudflareمزودمعالجةخارجيعندماتطلبالتحليلصراحة.
- النتائجتتحققمنschemaومراجعsourceId/requirementIdوتحفظكـInferred/NeedsReview؛ اللغاتومحركاتالتنفيذتقررحالاتPass/Failبقواعدصريحة.
- يمكنوضعمزودمتوافقخاصفيالأدواتالمتخصصة؛ مفاتيحهتُحفظمشفرةخادميًاولايظهرقيمتهافيالتقارير.

مراجع رسمية راجعت10نوفمبر2026: [الحصة والأسعار](https://developers.cloudflare.com/workers-ai/platform/pricing/)، [DurableObjectsFree](https://developers.cloudflare.com/durable-objects/platform/pricing/)، [النموذجالبصري](https://developers.cloudflare.com/workers-ai/models/llama-4-scout-17b-16e-instruct/).
