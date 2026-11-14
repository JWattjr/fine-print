# Archive source selection

Source availability and source suitability are separate checks. The ArchiveProbe proves that validators fetched a successful exact CDX row and substantial archived HTML. The passages below are selected only after code normalizes the retrieved text. Cached previews in `.source-cache/` are not on-chain proof.

## Zoom

The [March 1 capture](https://web.archive.org/web/20230301000542id_/https://explore.zoom.us/en/terms/) predates the explicit AI wording. The initially tested [August 12 capture](https://web.archive.org/web/20230812065407id_/https://explore.zoom.us/en/terms/) contains the August 11 clarification, including a prohibition on training from customer communications. It cannot establish the requested positive training-permission case.

CDX identified the [August 9 capture](https://web.archive.org/web/20230809192857id_/https://explore.zoom.us/en/terms/). Section 10.2 explicitly permits using Service Generated Data for machine learning and AI model training. The positive case must use a concern about that data category, preserving the distinction from Customer Content and the accompanying consent qualification. Its selected passage is 655 characters and is absent from the normalized baseline. This capture receives its own validator probe before deployment.

## X

The [January 1 baseline](https://web.archive.org/web/20230101004225id_/https://twitter.com/en/privacy) and [September 29 capture](https://web.archive.org/web/20230929213507id_/https://twitter.com/en/privacy) contain different normalized text. The later document includes an explicit permission to use collected and publicly available information to train ML or AI models. Exact passage presence and baseline absence still receive on-chain code checks.

## Adobe

The [June 5](https://web.archive.org/web/20240605152629id_/https://www.adobe.com/legal/terms.html) and [June 10](https://web.archive.org/web/20240610032329id_/https://www.adobe.com/legal/terms.html) captures both display the February 17 terms and normalize to the same SHA-256 digest, `180e49283b84c2f6c845ca9b76a1a565d1cda4f387e29ddc8350d0bac9cf2d2c`. They do not establish a new passage.

The [June 19 capture](https://web.archive.org/web/20240619003609id_/https://www.adobe.com/legal/terms.html) displays terms published and effective June 18. It contains the actual revised content-access and AI clarifications. This capture receives an additional probe and will be judged honestly against the chosen frozen concern. No favorable outcome is assumed.

## Capture selection rule

Historical watches set an explicit past as-of timestamp. Code asks CDX for the latest successful exact original URL at or before that timestamp, using the documented negative limit, then freezes its immutable `id_` URL and normalized digest. See the [Internet Archive CDX documentation](https://github.com/internetarchive/wayback/blob/master/wayback-cdx-server/README.md).
