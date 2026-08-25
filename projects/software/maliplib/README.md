# MalIPLib

`/projects/software/maliplib/`

MalIPLib is a malicious IP intelligence and enrichment library offering ASN, geo, and WHOIS tagging with scoring models for security analytics and network forensics.

## Browser companion

The static project page provides:

- IPv4/IPv6/private/loopback/link-local classification;
- batch normalization;
- user-supplied ASN/country labels;
- user-supplied blocklist/Tor/proxy indicators;
- transparent scoring;
- JSON export.

It does not claim live ASN, GeoIP or WHOIS enrichment in the static page.

The native project manifest includes `requests`, `geoip2`, `ipwhois`, `pandas`, and `sqlalchemy`, which are the appropriate path for configured enrichment sources and persistent datasets.

## Interpretation

IP intelligence supports network-security analysis. It should not be treated as proof that a specific person controlled a host or performed an action.

Version: `0.2.0`  
License: `MIT`
