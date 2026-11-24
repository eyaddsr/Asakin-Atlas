import type { Channel, EvidenceLevel, Integration, MechanismKind, System, UnresolvedClass } from '@shared/schema.ts';

export const UNDOC = 'غير موثق';

export const EVIDENCE_AR: Record<EvidenceLevel, string> = {
  production_verified: 'تحقق إنتاجي (مُبلّغ)',
  runtime_verified: 'تحقق تشغيلي (مُبلّغ)',
  test_verified: 'تحقق اختباري (مُبلّغ)',
  code_observed: 'ملاحظة من الكود (مُبلّغ)',
  reported: 'مُبلّغ/موثق فقط',
  proposed: 'استنتاج/مقترح',
  unknown: 'غير معروف',
};
export const EVIDENCE_SHORT: Record<EvidenceLevel, string> = {
  production_verified: 'PROD*', runtime_verified: 'RUN*', test_verified: 'TEST*', code_observed: 'CODE*', reported: 'DOC', proposed: 'INF', unknown: '?',
};

export const KIND_AR: Record<System['kind'], string> = {
  business_app: 'تطبيق أعمال', shared_service: 'خدمة مشتركة', external_service: 'مزوّد خارجي', sdk_library: 'مكتبة / SDK',
};
export const COVERAGE_AR: Record<System['coverage'], string> = { complete: 'تدقيق مكتمل', partial: 'تدقيق جزئي', not_audited: 'لم يُفحص بعد' };
export const COVERAGE_REASON_AR: Record<System['coverageReason'], string> = {
  audited: 'مُدقق', reply_truncated: 'رد الوكيل مقطوع', blocked_agent_busy: 'محجوب: وكيل المشروع مشغول', blocked_view_only: 'محجوب: صلاحية عرض فقط',
  registry_only: 'مسجل في Registry فقط', external_provider: 'مزوّد خارجي', library: 'مكتبة',
};
export const DEPLOY_AR: Record<System['deploymentStatus'], string> = {
  active: 'نشط (توثيقيًا)', inactive: 'غير نشط', draft: 'مسودة', deprecated: 'متقادم', unknown: 'غير معروف',
};
export const DOMAIN_AR: Record<string, string> = {
  identity_platform: 'الهوية والمنصة', communications: 'الاتصالات', property_management: 'إدارة الأملاك', investment: 'الاستثمار',
  finance: 'المالية', sales_marketing: 'المبيعات والتسويق', projects: 'المشاريع', internal_tools: 'أدوات داخلية', external: 'خارجي', other: 'أخرى',
};
export const MECH_AR: Record<MechanismKind, string> = {
  sso_oidc: 'SSO / OIDC', oidc_backchannel: 'خروج OIDC خلفي', registry_assisted_api: 'API مباشر بمساعدة Registry', registry_call: 'استدعاء Registry',
  rest_api: 'API مباشر', webhook: 'Webhook / حدث', sdk_call: 'استدعاء SDK', object_storage: 'تخزين كائنات', browser_asset: 'مورد متصفح',
  navigation_link: 'رابط تنقل', file_export: 'تصدير ملف', script: 'سكربت / مرة واحدة', manual: 'إدخال يدوي', internal: 'داخلي', unknown: UNDOC,
};
export const CORROB_AR: Record<Channel['corroboration'], string> = {
  one_sided: 'من طرف واحد', two_sided: 'مؤكد من الطرفين', provider_surface_match: 'مطابق لواجهة المزوّد', conflict: 'تعارض',
};
export const DEPLOY_CLAIM_AR: Record<Integration['deployment']['status'] | 'mixed', string> = {
  active: 'مفعّل في الكود', disabled: 'معطّل', unused: 'غير مستخدم', legacy: 'قديم', one_off: 'لمرة واحدة', unknown: UNDOC, mixed: 'مختلط',
};
export const UNRESOLVED_AR: Record<UnresolvedClass, string> = {
  any_granted_caller: 'أي تطبيق مخوّل (غير مسمّى)', unknown: 'غير معروف', multiple_systems: 'عدة أنظمة', operator: 'مشغّل بشري',
  scheduler: 'مجدول خارجي', end_user: 'مستخدم نهائي (ملف)', navigation_link: 'رابط تنقل', indirect_dependency: 'اعتماد غير مباشر',
  counterpart_not_stated: 'الطرف الآخر غير مذكور', unrecognized: 'غير متعرّف عليه',
};
export const TRI_AR = { yes: 'نعم', no: 'لا', unknown: UNDOC } as const;
export const GRANT_AR = {
  active: 'منحة نشطة', revoked: 'منحة ملغاة', none: 'لا توجد منحة', not_applicable: 'لا ينطبق', not_checkable: 'لا يمكن التحقق',
} as const;
export const TRIGGER_AR = { scheduled: 'مجدول', event: 'حدث', on_demand: 'عند الطلب', manual: 'يدوي', startup: 'عند الإقلاع', unknown: UNDOC } as const;
export const CARD_AR = { '1:1': '1:1', '1:N': '1:N', 'N:1': 'N:1', 'N:M': 'N:M', unknown: UNDOC } as const;

export const v = (x: string | null | undefined) => (x === null || x === undefined || x === '' ? UNDOC : x);

/* ---- approved design: verification states (derived; see docs/DESIGN_REFACTOR_PLAN.md §3) ---- */
export const VERIF_AR = { documented: 'موثّق', partial: 'جزئي', needs_verification: 'يحتاج تحقق' } as const;
export const VERIF_BASIS = {
  documented: 'موثّق: أبلغ وكيل التدقيق عن دليل من الكود أو أعلى، بطرفين محددين واتجاه بيانات معروف، ولا توجد أسئلة مفتوحة عليه. هذا ادعاء مُبلّغ وليس تحققًا مستقلًا.',
  partial: 'موثّق جزئيًا: الربط وارد في تقرير التدقيق، لكن بعض تفاصيله (اتجاه البيانات أو الدليل أو الحقول) لم تُحسم بعد.',
  needs_verification: 'يحتاج تحقق: الطرف الآخر غير محدد، أو الدليل غير معروف أو مستنتج، أو يوجد تعارض مفتوح.',
} as const;
export const LANE_KIND_AR = { channels: 'قناة', business: 'تطبيق أعمال', core: 'خدمة مشتركة', finance: 'تطبيق مالي', external: 'مزوّد خارجي' } as const;
export const TAG_AR = { required: 'مطلوب', identifier: 'معرّف', personal: 'بيان شخصي', uncertain_link: 'ربط غير مؤكد', withheld: 'محجوب' } as const;
export const TAG_TITLE = {
  required: 'حقل مطلوب بحسب تقرير التدقيق',
  identifier: 'يبدو معرّفًا (تقدير من اسم الحقل)',
  personal: 'قد يكون بيانًا شخصيًا (تقدير آلي من اسم الحقل، ليس تصنيفًا معتمدًا)',
  uncertain_link: 'ربط الحقل بهذا التكامل غير مؤكد ويحتاج مراجعة',
  withheld: 'جزء من النص محجوب لأنه يشبه بيانات سرية أو ملاحظة أمنية',
} as const;
export const CHANGE_AR = {
  outage: { ar: 'توقف النظام', desc: 'كل نظام يتبادل معه البيانات، ثم من يستقبل بيانات هؤلاء.' },
  data: { ar: 'تغيير بيانات يرسلها', desc: 'الأنظمة التي تستقبل بياناته مباشرة، ثم من يستقبل بياناتها.' },
  api: { ar: 'تغيير واجهته البرمجية', desc: 'الأنظمة التي تستدعي واجهته، ثم من يستقبل بياناتها.' },
} as const;
export const nCount = (n: number, one: string, two: string, many: string) => (n === 1 ? one : n === 2 ? two : `${n} ${many}`);
