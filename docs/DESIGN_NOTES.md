# Workspace design

CarePulse adapts visual cues from [Cottage Home Care](https://cottagehomecare.com/) and [Care Guide](https://careguidebd.com/) to an operational monitoring interface. The references were reviewed in a browser on 25 October 2026.

- Navy establishes the navigation, headings and brand mark. Pale blue groups the page introduction and guidance; warm orange identifies the main action.
- Bold sans-serif headings, larger form controls and readable status labels replace the previous small serif-and-sage presentation.
- All six destinations stay named on desktop, tablet and phone screens. Icons supplement the labels. The selected destination has a filled background and `aria-current`.
- The overview pairs its introduction with a summary of actual latest service health. Other views use a compact heading so their tables and forms remain close to the top.
- Incident evidence, explanation provenance, input errors, report previews and saved settings keep their existing workflows.

The health percentage is `round(healthy services / services with observations × 100)`. A service is healthy when its latest submitted check has no detected anomalies. An empty workspace shows a dash instead of a fabricated percentage. This is a snapshot of submitted metadata, not an uptime measurement. Manually resolving an incident does not change service health; a healthy new check does.

The pulse mark and navigation icons are local SVGs. No photographs, business claims, logos, testimonials, or contact details were copied from the references. Fonts use the operating system's installed sans-serif family, and the interface needs no third-party asset requests.

Verification includes browser interaction tests, automated accessibility checks across six views, and visual review at desktop, tablet and narrow phone widths. See [the verification record](TEST_RESULTS.md).
