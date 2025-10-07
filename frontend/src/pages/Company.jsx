setEnrichWhich('contacts');
setIsEnriching(true);

const enrichContacts = async () => {
  try {
    const res = await fetch('/api/lit/lusha/enrichContacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ company_id: String(companyId) })
    });

    if (!res.ok) throw new Error(`enrichContacts ${res.status}`);
    const data = await res.json();

    if (Array.isArray(data?.contacts)) {
      setContacts(data.contacts.map((c) => ({
        id: c.id || c.fullName,
        full_name: c.fullName || c.name,
        title: c.title || '',
        email: c.email || '',
        phone: c.phone || '',
        linkedin: c.linkedin || '',
        confidence: c.confidence,
        isPrimary: !!c.isPrimary,
      })));
    }

    if (data && data.company) {
      setCompany((prev) => ({
        ...prev,
        industry: data.company.industry || (prev && prev.industry) || null,
        hq_city: data.company.hqCity || (prev && prev.hq_city) || null,
        hq_country: data.company.hqCountry || (prev && prev.hq_country) || null,
        domain: data.company.domain || (prev && prev.domain) || null,
        employee_count: data.company.size || (prev && prev.employee_count) || null,
        confidence: data.company.confidence ?? (prev && prev.confidence),
      }));
    }

    console.log('[Company] enrichCompany -> start', { companyId });
    await enrichCompany({ company_id: String(companyId) });
    console.log('[Company] enrichCompany <- ok');

    await load();
  } catch (err) {
    console.error('Enrichment error:', err);
  }
};

// ✅ Call the async function here
enrichContacts();
