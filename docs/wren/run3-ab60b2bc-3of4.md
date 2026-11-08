**Seldon QA — Seldon QA: loft · loft** · 3/4 passed (75%) · ❌1

> 3 of 4 tests passed. File upload, photo backup, and Google Drive migration all completed successfully end-to-end with no visible errors. The one failure is in the zero-config onboarding flow: the drive page never greets the user by name (the acceptance criterion requires a name greeting, but none appears anywhere on the page), and the 'Open Telegram' button points to a localhost address that real users cannot reach, making step 3 of onboarding completely inaccessible without a manual workaround. This is a major gap — new users following the intended onboarding path would be stuck before they can fully connect their account.

| | Case |
|---|---|
| ❌ `MAJOR` | `onboarding` Zero-config onboarding lands in an empty drive |
| ✅ | `upload-file` Added file appears in the drive and can be opened |
| ✅ | `photo-backup` Phone photo backup uploads the camera roll |
| ✅ | `gdrive-migration` Google Drive migration copies files into the drive |

---
##### onboarding — Zero-config onboarding lands in an empty drive
acceptance: the drive page greets the user by name and shows three choices — "Move my Google Drive", "Back up my phone photos" and "Upload a file" — with no password or sign-up form anywhere in the flow
expected: The drive page greets the user by name and shows the three choices — 'Move my Google Drive', 'Back up my phone photos', and 'Upload a file' — with no password or sign-up form anywhere in the flow.
observed: The drive page showed all three required choices and no password or sign-up form, but it never greeted the user by name — the heading read 'Where should we start?' with no name displayed anywhere; the only name-like element (a circular 'N' avatar) opened a developer tools menu instead of a profile. Additionally, the 'Open Telegram' button pointed to a localhost address that refused to connect, blocking real users from completing step 3 without a manual workaround.
recommendation: Fix two issues: (1) The 'Open Telegram' button's link must point to the public Cloudflare host, not localhost — real users cannot reach localhost and the onboarding flow is completely broken for them at this step. (2) After sign-in, the drive page must display the user's Telegram name (e.g. 'Welcome, [Name]' or similar) — the name greeting is a stated acceptance criterion and is entirely absent.
repro:
1. Go to the product home page.
2. Click 'Get unlimited storage'.
3. Click 'Open Telegram' — the browser navigates to a localhost address and shows a connection error.
4. Even if that step is worked around and the full flow is completed, open the drive page and observe that no greeting with the user's name appears anywhere on the page.
recording: [gif](https://storage.googleapis.com/experiment-persona-output/experiment_reports/experiment_id%3Dab60b2bc-9836-48c6-b1a4-5e13cc2b6469/persona_id%3Dab60b2bc-9836-48c6-b1a4-5e13cc2b6469/gifs/run_0_step_0.gif?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=blok-backend%40blok-auth-458418.iam.gserviceaccount.com%2F20261107%2Fauto%2Fstorage%2Fgoog4_request&X-Goog-Date=20261107T223701Z&X-Goog-Expires=604799&X-Goog-SignedHeaders=host&X-Goog-Signature=a24a1d4690babe8564236c2d992095d183d9dda7b234fee74fb46d0334e525658e414d096bb8125735b25e7c527163749951967dc61f7f43751d78c7812519fc5764f9cbca12d5829934970dae274e1aa278296d4f2c7f08a3b4203de3de09dcc52e32f15615b410f1835f8fcb50dfc9f6822ff6116306c21d71d8736b5eda3a33efd37927b40bdc3104b81b8b40ec794acca9855f482620282b0f7b405a66a09e9444fc1c0f8a07f57f2e3db438178d6722e7c3a82dd1661f6da003e04ada1580866c5ac3e6e05bb546c96e0971d9ef3fe03b49b84909e3cd1184ea5392ffc6e89679a09977039a83f1fd475ddf93d7e73095fbdcb3c0e5019421718abf3cdf)
duration: 212.473s
