# Tutorly education choices

`data/education-registry.json` is the central profile/onboarding choice source: **31 boards/programme providers** (29 Indian boards, including separately identified secondary/higher-secondary authorities, plus the existing IB and Cambridge choices), and **29 subject preferences**. It is deliberately separate from the verified curriculum catalogue. Selecting a board does not assert affiliation, imported chapters, curriculum availability, or teacher verification.

## API and stored values

Load `js/education-registry.js`, then `await TutorlyEducation.load()` once before rendering. Concurrent calls share one fetch; failures clear the in-flight cache so Retry works. The immutable result contains `boards` and `subjects`.

- `searchBoards(query)` returns matching boards synchronously, matching IDs, names, abbreviations, states and aliases; exact matches rank first.
- `searchSubjects(query)` returns preference subjects from the same registry.
- `board(idOrAlias)` resolves an exact saved ID/value or alias; unknown values return `null`, never an invented board.
- Store `board.curriculumValue` for compatibility with the existing `TutorlyCurriculum` normalizers (`CBSE`, `CISCE`, `TELANGANA`, `KERALA`, `TAMIL_NADU`, etc.). The registry ID can additionally be retained where needed.
- Teacher subject preference names remain compatible with existing Tutorly subjects. Stable preference IDs are available for future callers. These preferences are **not** a second chapter syllabus.
- NCERT is a CBSE alias, not a separate examination board. ICSE/ISC resolve to CISCE. Legacy Assam SEBA/AHSEC aliases resolve to current ASSEB; KSEEB resolves to KSEAB.
- Do not silently map an unspecified legacy “State Board” to a particular state. Ask the student to select their actual board only when that field needs editing/completion; do not overwrite saved profiles.

## Official source review

Reviewed 21 September 2026. Each board record includes its evidence URLs. Only names and concise identifiers are stored; no textbook content, logos, affiliations, or private data.

- [Ministry of Education board list](https://www.education.gov.in/sites/upload_files/mhrd/files/Scholarship_CSSS.pdf) supports the established state-board names. It is an older government list, so it is **not** used for obsolete Assam or Karnataka names; it also does not establish current curriculum coverage.
- [CBSE](https://www.cbse.gov.in/cbsenew/cbse.html) and [CISCE](https://cisce.org/) supply their official names.
- [Telangana SSC results authority](https://www.results.bse.telangana.gov.in/result.html), [DGE Telangana](https://bse.telangana.gov.in/), [TGBIE services](https://satgbie.cgg.gov.in/login.do), and [Telangana state directory](https://www.telangana.gov.in/state-web-directory/) distinguish secondary and intermediate authorities.
- [Andhra Pradesh DGE](https://www.bse.ap.gov.in/) and its linked 2026 instructions verify the secondary board name.
- [Kerala Board of Public Examinations](https://www.kbpe.kerala.gov.in/?page=seo) and [Pareeksha Bhavan](https://pareekshabhavan.kerala.gov.in/) verify the SSLC authority; the government higher-secondary notification linked in the data records the separate examination authority.
- [Karnataka government recruitment portal](https://sts.karnataka.gov.in/GPSTRNHK/) explicitly distinguishes current KSEAB from former KSEEB; [the government NeSDA report](https://darpg.gov.in/sites/default/files/NeSDA_July.pdf) independently confirms the renaming.
- [Tamil Nadu DGE](https://www.dge.tn.gov.in/aboutus.html) records the State Board of School Examinations name.
- [ASSEB Division I](https://www.sebaonline.org/) and [Division II](https://asseb.ahsecexam.in/) establish the current Assam name.
- [Haryana](https://bseh.org.in/), [Himachal Pradesh](https://www.hpbose.org/), [Jharkhand](https://jac.jharkhand.gov.in/jac/) and [Rajasthan](https://rajeduboard.rajasthan.gov.in/) were checked against their official pages.
- [West Bengal's official about page](https://wbbse.wb.gov.in/Web/AboutUs?l=GmOMh4ieAsfBrSunLPBveA%3D%3D), [Odisha's government activity report](https://sme.odisha.gov.in/sites/default/files/2020-03/Activity_Report.pdf), and [Ministry NIOS report](https://www.education.gov.in/sites/upload_files/mhrd/files/5-1.pdf) support the remaining entries.
- [IB](https://www.ibo.org/about-the-ib/) and [Cambridge](https://www.cambridgeinternational.org/) retain the previously offered international choices. Their `type` is `international`, not an invented Indian state board.

Some official home pages returned timeouts/403s to the research fetch. Their names are supported by the linked government list or indexed official pages; availability of those external websites is not an application dependency. No unverified third-party “board” sites were added.

## Maintenance and tests

Add new boards only with an official board/government source and unique stable ID + curriculum value. This is broad initial coverage, **not every Indian board**. Do not repurpose an existing ID for a different authority. Review renamed/merged authorities and preserve old search aliases. Adding a profile choice never bypasses the curriculum API's verified-record policy.

Run `node tests/education-registry-check.js` for schema, exact/alias/multiword search, CBSE/CISCE normalization, state/intermediate separation, historical names, retained IB/Cambridge choices, unknown values, immutable shared data, one-request loading, retry and subpath hosting checks. No live endpoint is called by this deterministic test.
