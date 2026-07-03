# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.29.0](https://github.com/dryvist/ai-workflows/compare/v0.28.0...v0.29.0) (2026-07-03)


### Features

* add cc-pr-review-responder reusable workflow ([dfd9a5e](https://github.com/dryvist/ai-workflows/commit/dfd9a5e10d5fc093b24779c5f21a5cd6d430d4ab))

## [0.28.0](https://github.com/dryvist/ai-workflows/compare/v0.27.0...v0.28.0) (2026-07-03)


### Features

* **dependency-review:** untrusted-tier AI reviewer with native gate ([b014198](https://github.com/dryvist/ai-workflows/commit/b0141982a633d12d790bb75746ca45c2b5d0c459))

## [0.27.0](https://github.com/dryvist/ai-workflows/compare/v0.26.2...v0.27.0) (2026-07-03)


### Features

* declare GH_APP_CLAUDE_BOT_PRIVATE_KEY on review-thread-resolver ([#320](https://github.com/dryvist/ai-workflows/issues/320)) ([6c762e3](https://github.com/dryvist/ai-workflows/commit/6c762e3773969aa5b6d8f09b8a427201b1b25934))

## [0.26.2](https://github.com/dryvist/ai-workflows/compare/v0.26.1...v0.26.2) (2026-07-03)


### Bug Fixes

* validate check-runs API response in _ai-merge-gate ([#315](https://github.com/dryvist/ai-workflows/issues/315)) ([71d2c1c](https://github.com/dryvist/ai-workflows/commit/71d2c1c845d5f00b6dcac635e2d45a01386c6c69)), closes [#302](https://github.com/dryvist/ai-workflows/issues/302)

## [0.26.1](https://github.com/dryvist/ai-workflows/compare/v0.26.0...v0.26.1) (2026-07-03)


### Bug Fixes

* declare GH_ACTION_AI_API_KEY on comment workflows for explicit secret passing ([#313](https://github.com/dryvist/ai-workflows/issues/313)) ([b4875cc](https://github.com/dryvist/ai-workflows/commit/b4875cc763fc8908bbf8d9e1e50a085e75bb7fa1))

## [0.26.0](https://github.com/dryvist/ai-workflows/compare/v0.25.0...v0.26.0) (2026-07-03)


### Features

* add cc-release-notes reusable workflow ([#310](https://github.com/dryvist/ai-workflows/issues/310)) ([fd915df](https://github.com/dryvist/ai-workflows/commit/fd915df17e0b46bafb8d8ad97ee614cf4fbf8735))

## [0.25.0](https://github.com/dryvist/ai-workflows/compare/v0.24.0...v0.25.0) (2026-07-03)


### Features

* add cc-dep-review reusable workflow ([#307](https://github.com/dryvist/ai-workflows/issues/307)) ([7849e22](https://github.com/dryvist/ai-workflows/commit/7849e22ad594cfc268fa55b5f035e4eaf9be3d5a))

## [0.24.0](https://github.com/dryvist/ai-workflows/compare/v0.23.7...v0.24.0) (2026-07-03)


### Features

* add review-thread-resolver reusable workflow ([#306](https://github.com/dryvist/ai-workflows/issues/306)) ([6cb6a79](https://github.com/dryvist/ai-workflows/commit/6cb6a799795238280bc513e7f3f7b8c9e2958f1f))

## [0.23.7](https://github.com/dryvist/ai-workflows/compare/v0.23.6...v0.23.7) (2026-07-02)


### Bug Fixes

* remove inputs-in-with from backlog example (schedule startup failure) ([7556708](https://github.com/dryvist/ai-workflows/commit/7556708c402d6c1fac07ba7329ea724d5dcce940))

## [0.23.6](https://github.com/dryvist/ai-workflows/compare/v0.23.5...v0.23.6) (2026-07-02)


### Bug Fixes

* remove colliding concurrency from backlog example caller ([a6bbfad](https://github.com/dryvist/ai-workflows/commit/a6bbfad94ffba90c706509948b0a56558efb9464))

## [0.23.5](https://github.com/dryvist/ai-workflows/compare/v0.23.4...v0.23.5) (2026-07-02)


### Bug Fixes

* remove actions:read from issue-backlog-sweep (broke workflow_call) ([50c2053](https://github.com/dryvist/ai-workflows/commit/50c20530b2fcf93465f4928008d2986c31c12208))

## [0.23.4](https://github.com/dryvist/ai-workflows/compare/v0.23.3...v0.23.4) (2026-07-02)


### Bug Fixes

* **write-workflows:** stage via add+reset so gitignored .ai-workflows doesn't break commits ([#294](https://github.com/dryvist/ai-workflows/issues/294)) ([9290f35](https://github.com/dryvist/ai-workflows/commit/9290f35799d08c3853161fabcf2126b09d989f1b))

## [0.23.3](https://github.com/dryvist/ai-workflows/compare/v0.23.2...v0.23.3) (2026-07-02)


### Bug Fixes

* **write-workflows:** clear stale index.lock + surface git stderr in verified-commit ([#292](https://github.com/dryvist/ai-workflows/issues/292)) ([46844c2](https://github.com/dryvist/ai-workflows/commit/46844c2d441786d3603cdc336d4ea709a8b9caeb))

## [0.23.2](https://github.com/dryvist/ai-workflows/compare/v0.23.1...v0.23.2) (2026-07-02)


### Bug Fixes

* drop issue-backlog-sweep secrets block (broke workflow_call) ([9fb2d01](https://github.com/dryvist/ai-workflows/commit/9fb2d011207e689fa75c8344a9ca127ce3854f94))

## [0.23.1](https://github.com/dryvist/ai-workflows/compare/v0.23.0...v0.23.1) (2026-07-02)


### Bug Fixes

* declare explicit secrets on issue-backlog-sweep reusable ([4e8a526](https://github.com/dryvist/ai-workflows/commit/4e8a52670fe056a9282627f3fba6733ae4aeaa0c))

## [0.23.0](https://github.com/dryvist/ai-workflows/compare/v0.22.0...v0.23.0) (2026-07-02)


### Features

* add issue-backlog-sweep reusable workflow ([4d14e0d](https://github.com/dryvist/ai-workflows/commit/4d14e0d2b357000a88d1956eb141c2f2e5c7aff2))

## [0.22.0](https://github.com/dryvist/ai-workflows/compare/v0.21.1...v0.22.0) (2026-07-02)


### Features

* **run-claude-code:** inject canonical org instructions into CI Claude ([#281](https://github.com/dryvist/ai-workflows/issues/281)) ([96433fa](https://github.com/dryvist/ai-workflows/commit/96433fa661254eeb32723d645f079231979d3a19))

## [0.21.1](https://github.com/dryvist/ai-workflows/compare/v0.21.0...v0.21.1) (2026-06-22)


### Bug Fixes

* **issue-resolver:** open PR via createCommitOnBranch instead of Claude git/gh ([#272](https://github.com/dryvist/ai-workflows/issues/272)) ([75adb53](https://github.com/dryvist/ai-workflows/commit/75adb53a38c5f374012ca820d64946393bb86d3f))

## [0.21.0](https://github.com/dryvist/ai-workflows/compare/v0.20.3...v0.21.0) (2026-06-22)


### Features

* **issue-resolver:** ai:ready label trigger, no size cap, autonomous triage→resolve chain ([#270](https://github.com/dryvist/ai-workflows/issues/270)) ([52a6b75](https://github.com/dryvist/ai-workflows/commit/52a6b75a073625fa05d42d5415dfbdf1c2d9dc0d))

## [0.20.3](https://github.com/dryvist/ai-workflows/compare/v0.20.2...v0.20.3) (2026-06-21)


### Bug Fixes

* **cc-ci-fix:** commit fixes to PR branch via createCommitOnBranch (workflow_run-compatible) ([#265](https://github.com/dryvist/ai-workflows/issues/265)) ([1b8f128](https://github.com/dryvist/ai-workflows/commit/1b8f12845f25c0843907e91b188e7668d7d205dd))

## [0.20.2](https://github.com/dryvist/ai-workflows/compare/v0.20.1...v0.20.2) (2026-06-21)


### Bug Fixes

* **cc-ci-fix:** revert to web-flow commit signing ([#261](https://github.com/dryvist/ai-workflows/issues/261) broke signed-commit repos) ([#263](https://github.com/dryvist/ai-workflows/issues/263)) ([9349890](https://github.com/dryvist/ai-workflows/commit/9349890dd7468a153265c27a8cc74cf2cfd86990))

## [0.20.1](https://github.com/dryvist/ai-workflows/compare/v0.20.0...v0.20.1) (2026-06-21)


### Bug Fixes

* **cc-ci-fix:** commit all working-tree changes (capture formatter fixes) ([#261](https://github.com/dryvist/ai-workflows/issues/261)) ([774c3aa](https://github.com/dryvist/ai-workflows/commit/774c3aa1a329000f8cbbed0f5b3d9bebaa5e91c7))

## [0.20.0](https://github.com/dryvist/ai-workflows/compare/v0.19.1...v0.20.0) (2026-06-21)


### Features

* **suite-ci:** forward daily_run_limit to cc-ci-fix ([#259](https://github.com/dryvist/ai-workflows/issues/259)) ([c641354](https://github.com/dryvist/ai-workflows/commit/c641354cfb6461dd4ecce8964e808b2be6b0d388))

## [0.19.1](https://github.com/dryvist/ai-workflows/compare/v0.19.0...v0.19.1) (2026-06-20)


### Bug Fixes

* **auth:** keep generic GH_ACTION_AI_API_KEY name for the OAuth credential ([#257](https://github.com/dryvist/ai-workflows/issues/257)) ([2ab1098](https://github.com/dryvist/ai-workflows/commit/2ab10980fe591c77e7ab6d3ccfb94414b89d8c57))

## [0.19.0](https://github.com/dryvist/ai-workflows/compare/v0.18.0...v0.19.0) (2026-06-20)


### ⚠ BREAKING CHANGES

* **auth:** workflows now read secrets.GH_ACTION_AI_OAUTH_TOKEN (a Claude Code OAuth token, sk-ant-oat-...) instead of secrets.GH_ACTION_AI_API_KEY. Create the GH_ACTION_AI_OAUTH_TOKEN org secret before running.

### Bug Fixes

* **auth:** authenticate via Claude Code OAuth token, not API key ([#255](https://github.com/dryvist/ai-workflows/issues/255)) ([25c4fdc](https://github.com/dryvist/ai-workflows/commit/25c4fdcc09af0d21ab94bb2c91fadfce03efeeb0))

## [0.18.0](https://github.com/dryvist/ai-workflows/compare/v0.17.1...v0.18.0) (2026-06-20)


### ⚠ BREAKING CHANGES

* reusable workflow paths gain a cc- prefix and auth/model secret+var names move to GH_ACTION_AI_*. Consumers must update uses: paths and provision GH_ACTION_AI_API_KEY (secret) + GH_ACTION_AI_BASE_URL/_MODEL* (vars).

### Features

* generic GH_ACTION_AI_* auth namespace + cc- prefix on Claude write-workflows ([#251](https://github.com/dryvist/ai-workflows/issues/251)) ([9385ceb](https://github.com/dryvist/ai-workflows/commit/9385ceb71371bc3a6c80f359ee76dea43b625222))

## [0.17.1](https://github.com/dryvist/ai-workflows/compare/v0.17.0...v0.17.1) (2026-06-12)


### Bug Fixes

* **actions:** remove expression syntax from action input descriptions ([#246](https://github.com/dryvist/ai-workflows/issues/246)) ([456f7d9](https://github.com/dryvist/ai-workflows/commit/456f7d967b6cb7aabf11fb8c7c4859755ab1a9ab))

## [0.17.0](https://github.com/dryvist/ai-workflows/compare/v0.16.1...v0.17.0) (2026-06-04)


### Features

* **project-router:** native routing + drop invalid openrouter/free fallback ([#244](https://github.com/dryvist/ai-workflows/issues/244)) ([2f28cd4](https://github.com/dryvist/ai-workflows/commit/2f28cd47cd24afae842629b44716cf1fdf81cb13))

## [0.16.1](https://github.com/dryvist/ai-workflows/compare/v0.16.0...v0.16.1) (2026-06-01)


### Bug Fixes

* **ci:** repoint release-please caller to org-native reusable workflow ([#240](https://github.com/dryvist/ai-workflows/issues/240)) ([3d92946](https://github.com/dryvist/ai-workflows/commit/3d92946486d7bdf29aea886f8cafe6d1cde0e38c))
* **ci:** retarget reusable-workflow uses: refs to current org homes ([#238](https://github.com/dryvist/ai-workflows/issues/238)) ([5b25275](https://github.com/dryvist/ai-workflows/commit/5b252758ed4edd6c46b32e1c9a586c9d5394bd9b))

## [0.16.0](https://github.com/JacobPEvans/ai-workflows/compare/v0.15.1...v0.16.0) (2026-05-24)


### Features

* **attribution:** apply agentic-workflows label to declarative bot PRs/issues ([#232](https://github.com/JacobPEvans/ai-workflows/issues/232)) ([fc97d3f](https://github.com/JacobPEvans/ai-workflows/commit/fc97d3fbeaf59c1d7ca8583b5da88fcb7a05fc40))

## [0.15.1](https://github.com/JacobPEvans/ai-workflows/compare/v0.15.0...v0.15.1) (2026-05-21)


### Bug Fixes

* **deps:** refresh gh-aw action SHA pins ([#226](https://github.com/JacobPEvans/ai-workflows/issues/226)) ([b8c3c64](https://github.com/JacobPEvans/ai-workflows/commit/b8c3c640d909fdb16dad35024590032a82bf6412))

## [0.15.0](https://github.com/JacobPEvans/ai-workflows/compare/v0.14.1...v0.15.0) (2026-05-19)


### Features

* **workflows:** add runner_label input to all reusable workflows ([#223](https://github.com/JacobPEvans/ai-workflows/issues/223)) ([3514f98](https://github.com/JacobPEvans/ai-workflows/commit/3514f98a6120ebfd75fb6e03c0261418e6142984))

## [0.14.1](https://github.com/JacobPEvans/ai-workflows/compare/v0.14.0...v0.14.1) (2026-05-18)


### Bug Fixes

* **deps:** refresh gh-aw action SHA pins ([#221](https://github.com/JacobPEvans/ai-workflows/issues/221)) ([8c63606](https://github.com/JacobPEvans/ai-workflows/commit/8c63606f9300958aeeceab27340b4e16c8216e18))

## [0.14.0](https://github.com/JacobPEvans/ai-workflows/compare/v0.13.6...v0.14.0) (2026-05-17)


### Features

* **actions:** centralize claude-code-action invocation via composite ([#217](https://github.com/JacobPEvans/ai-workflows/issues/217)) ([a06a2f0](https://github.com/JacobPEvans/ai-workflows/commit/a06a2f0b86cbf5e26547260f55fd6ce23fa6f8f4))

## [0.13.6](https://github.com/JacobPEvans/ai-workflows/compare/v0.13.5...v0.13.6) (2026-05-14)


### Bug Fixes

* **deps:** refresh gh-aw action SHA pins ([#215](https://github.com/JacobPEvans/ai-workflows/issues/215)) ([8716952](https://github.com/JacobPEvans/ai-workflows/commit/87169525c7e36f139242604198dd253955791c95))

## [0.13.5](https://github.com/JacobPEvans/ai-workflows/compare/v0.13.4...v0.13.5) (2026-05-11)


### Bug Fixes

* **deps:** refresh gh-aw action SHA pins ([#212](https://github.com/JacobPEvans/ai-workflows/issues/212)) ([6c417a9](https://github.com/JacobPEvans/ai-workflows/commit/6c417a9e6bd62a3d1d2940541dc69ac2e71cadcb))

## [0.13.4](https://github.com/JacobPEvans/ai-workflows/compare/v0.13.3...v0.13.4) (2026-05-07)


### Bug Fixes

* **deps:** refresh gh-aw action SHA pins ([#210](https://github.com/JacobPEvans/ai-workflows/issues/210)) ([ed1d2ee](https://github.com/JacobPEvans/ai-workflows/commit/ed1d2ee8cb5cfc27ecfb1b21cd0e3ea2f7d720bb))

## [0.13.3](https://github.com/JacobPEvans/ai-workflows/compare/v0.13.2...v0.13.3) (2026-05-06)


### Bug Fixes

* **issue-resolver:** restrict git tools to read-only to enforce signed commits ([14b27a3](https://github.com/JacobPEvans/ai-workflows/commit/14b27a3c698768f6522ce5acb74b89fd138a038c))

## [0.13.2](https://github.com/JacobPEvans/ai-workflows/compare/v0.13.1...v0.13.2) (2026-05-04)


### Bug Fixes

* **deps:** refresh gh-aw action SHA pins ([#206](https://github.com/JacobPEvans/ai-workflows/issues/206)) ([0e65c2c](https://github.com/JacobPEvans/ai-workflows/commit/0e65c2c2fa315dd8e5cee0f79dd766108d240825))

## [0.13.1](https://github.com/JacobPEvans/ai-workflows/compare/v0.13.0...v0.13.1) (2026-05-03)


### Bug Fixes

* **ci:** remove deprecated app-id secret passthrough ([f0b762e](https://github.com/JacobPEvans/ai-workflows/commit/f0b762e4fcfb413144ba92c63f4356eadabb67b0))

## [0.13.0](https://github.com/JacobPEvans/ai-workflows/compare/v0.12.12...v0.13.0) (2026-05-02)


### Features

* **shared:** host + trim repo-health-audit in ai-workflows ([#191](https://github.com/JacobPEvans/ai-workflows/issues/191)) ([0f90f66](https://github.com/JacobPEvans/ai-workflows/commit/0f90f66b3501c607585f49c3ea58029ffbc8042d))

## [0.12.12](https://github.com/JacobPEvans/ai-workflows/compare/v0.12.11...v0.12.12) (2026-05-02)


### Bug Fixes

* **deps:** refresh gh-aw action SHA pins ([#196](https://github.com/JacobPEvans/ai-workflows/issues/196)) ([54b8bd1](https://github.com/JacobPEvans/ai-workflows/commit/54b8bd1e13841c2ade3879346f7def3827a6d0f4))

## [0.12.11](https://github.com/JacobPEvans/ai-workflows/compare/v0.12.10...v0.12.11) (2026-05-02)


### Bug Fixes

* **ai-moderator:** reduce hide_comment blast radius and fix lockfile compilation ([#189](https://github.com/JacobPEvans/ai-workflows/issues/189)) ([946f7d9](https://github.com/JacobPEvans/ai-workflows/commit/946f7d980be5ee13183e997e4a91551e1cfe52bd))

## [0.12.10](https://github.com/JacobPEvans/ai-workflows/compare/v0.12.9...v0.12.10) (2026-04-29)


### Bug Fixes

* **deps:** refresh gh-aw action SHA pins ([#192](https://github.com/JacobPEvans/ai-workflows/issues/192)) ([4b4846b](https://github.com/JacobPEvans/ai-workflows/commit/4b4846b9e289ccf0314aa15a46b0429d728d5b52))

## [0.12.9](https://github.com/JacobPEvans/ai-workflows/compare/v0.12.8...v0.12.9) (2026-04-26)


### Bug Fixes

* **workflows:** remove invalid openrouter/free fallback and add preflight check ([d44891f](https://github.com/JacobPEvans/ai-workflows/commit/d44891f6b9b5b1624278c8c92ca03c8363c4d9a8)), closes [#235](https://github.com/JacobPEvans/ai-workflows/issues/235)

## [0.12.8](https://github.com/JacobPEvans/ai-workflows/compare/v0.12.7...v0.12.8) (2026-04-25)


### Bug Fixes

* **workflows:** replace dogfood-all nested calls with gh API ([#180](https://github.com/JacobPEvans/ai-workflows/issues/180)) ([d3ec148](https://github.com/JacobPEvans/ai-workflows/commit/d3ec148a8e19509f29daf4767f9e3f54577a0f5f))

## [0.12.7](https://github.com/JacobPEvans/ai-workflows/compare/v0.12.6...v0.12.7) (2026-04-25)


### Bug Fixes

* **workflows:** repair dogfood-all so dispatches and cron actually run ([3c7a320](https://github.com/JacobPEvans/ai-workflows/commit/3c7a320098935da8f4a4b3f784e38695baac2e1b)), closes [#175](https://github.com/JacobPEvans/ai-workflows/issues/175)

## [0.12.6](https://github.com/JacobPEvans/ai-workflows/compare/v0.12.5...v0.12.6) (2026-04-24)


### Bug Fixes

* **deps:** refresh gh-aw action SHA pins ([#172](https://github.com/JacobPEvans/ai-workflows/issues/172)) ([d7d86e0](https://github.com/JacobPEvans/ai-workflows/commit/d7d86e0179628bc9934ceb1af51110b9afa20d1b))

## [0.12.5](https://github.com/JacobPEvans/ai-workflows/compare/v0.12.4...v0.12.5) (2026-04-21)


### Bug Fixes

* **ci:** add gh-aw-pin-refresh workflow and recompile lock files ([3aa3551](https://github.com/JacobPEvans/ai-workflows/commit/3aa35511581e641312bf59b20061f12a002447ff))

## [0.12.4](https://github.com/JacobPEvans/ai-workflows/compare/v0.12.3...v0.12.4) (2026-04-19)


### Bug Fixes

* **workflows:** move ANTHROPIC_BASE_URL to job-level env ([#165](https://github.com/JacobPEvans/ai-workflows/issues/165)) ([230055f](https://github.com/JacobPEvans/ai-workflows/commit/230055f7ce3f0e1fba9fc2527d7c724cfc5c31b1))

## [0.12.3](https://github.com/JacobPEvans/ai-workflows/compare/v0.12.2...v0.12.3) (2026-04-18)


### Bug Fixes

* **workflows:** exclude copilot[bot], make notify-ai-pr configurable ([#162](https://github.com/JacobPEvans/ai-workflows/issues/162)) ([4ef802c](https://github.com/JacobPEvans/ai-workflows/commit/4ef802c2e11ddf0f0d88143858ac873aff94344b))

## [0.12.2](https://github.com/JacobPEvans/ai-workflows/compare/v0.12.1...v0.12.2) (2026-04-13)


### Bug Fixes

* add automation bots to AI Moderator skip-bots ([#155](https://github.com/JacobPEvans/ai-workflows/issues/155)) ([0ed80f0](https://github.com/JacobPEvans/ai-workflows/commit/0ed80f0489e7992d02ccebe7c338025775e8cd2c))

## [0.12.1](https://github.com/JacobPEvans/ai-workflows/compare/v0.12.0...v0.12.1) (2026-04-12)


### Bug Fixes

* remove deliberate failing test after ci-doctor validation ([#152](https://github.com/JacobPEvans/ai-workflows/issues/152)) ([a366fbc](https://github.com/JacobPEvans/ai-workflows/commit/a366fbc36f341dd0449b21440cc9617b38985381))

## [0.12.0](https://github.com/JacobPEvans/ai-workflows/compare/v0.11.4...v0.12.0) (2026-04-08)


### Features

* add AI merge gate and documentation drift detector ([#132](https://github.com/JacobPEvans/ai-workflows/issues/132)) ([0f255e1](https://github.com/JacobPEvans/ai-workflows/commit/0f255e19a948e4165faf8f7117aed516aaffe1b3))

## [0.11.4](https://github.com/JacobPEvans/ai-workflows/compare/v0.11.3...v0.11.4) (2026-04-07)


### Bug Fixes

* disable claude-review workflow — replaced by Gemini + Copilot ([#130](https://github.com/JacobPEvans/ai-workflows/issues/130)) ([3fc7892](https://github.com/JacobPEvans/ai-workflows/commit/3fc7892413412a02a6f7bed5fd81eb48c3cb51da))

## [0.11.3](https://github.com/JacobPEvans/ai-workflows/compare/v0.11.2...v0.11.3) (2026-04-03)


### Bug Fixes

* rename "Copilot coding agent" → "Copilot cloud agent" ([#127](https://github.com/JacobPEvans/ai-workflows/issues/127)) ([03c1cd8](https://github.com/JacobPEvans/ai-workflows/commit/03c1cd84f9edb55c92bbf449371b6e23df58ad73))

## [0.11.2](https://github.com/JacobPEvans/ai-workflows/compare/v0.11.1...v0.11.2) (2026-03-26)


### Bug Fixes

* switch OPENROUTER_BASE_URL from vars to secrets ([#123](https://github.com/JacobPEvans/ai-workflows/issues/123)) ([6c8add4](https://github.com/JacobPEvans/ai-workflows/commit/6c8add4c217d65a2b15a895ccc085c779379e7ae))

## [0.11.1](https://github.com/JacobPEvans/ai-workflows/compare/v0.11.0...v0.11.1) (2026-03-25)


### Bug Fixes

* extract shared date-window utility and centralize ceiling constants ([#119](https://github.com/JacobPEvans/ai-workflows/issues/119)) ([dc7ca0d](https://github.com/JacobPEvans/ai-workflows/commit/dc7ca0d1d021f6880487faf1fe9e9725fa1c5697))

## [0.11.0](https://github.com/JacobPEvans/ai-workflows/compare/v0.10.1...v0.11.0) (2026-03-25)


### Features

* migrate to OpenRouter with AI_MODEL category system ([#116](https://github.com/JacobPEvans/ai-workflows/issues/116)) ([40696f7](https://github.com/JacobPEvans/ai-workflows/commit/40696f7ec5c94080061f75406edbba2219168938))

## [0.10.1](https://github.com/JacobPEvans/ai-workflows/compare/v0.10.0...v0.10.1) (2026-03-19)


### Bug Fixes

* standardize release-please workflow and config ([0f6bf97](https://github.com/JacobPEvans/ai-workflows/commit/0f6bf979f20cf9cd245e1008bed156a5b7b8a25c))

## [0.10.0](https://github.com/JacobPEvans/ai-workflows/compare/v0.9.4...v0.10.0) (2026-03-08)


### Features

* disable automatic triggers on Claude-executing workflows ([912eede](https://github.com/JacobPEvans/ai-workflows/commit/912eedea8cc19f3fdbe73a2d517ba902c364d034))

## [0.9.4](https://github.com/JacobPEvans/ai-workflows/compare/v0.9.3...v0.9.4) (2026-03-07)


### Bug Fixes

* add shared PR ceiling gate and duplicate check prompts ([#107](https://github.com/JacobPEvans/ai-workflows/issues/107)) ([76ee11e](https://github.com/JacobPEvans/ai-workflows/commit/76ee11ea09857a816951f4378d9f36efb4a06bcb))

## [0.9.3](https://github.com/JacobPEvans/ai-workflows/compare/v0.9.2...v0.9.3) (2026-03-07)


### Bug Fixes

* allow claude[bot] to trigger ci-fix on its own PRs ([#105](https://github.com/JacobPEvans/ai-workflows/issues/105)) ([899cbb4](https://github.com/JacobPEvans/ai-workflows/commit/899cbb40be886d7287806dedb970c22c7fd9c8fe))

## [0.9.2](https://github.com/JacobPEvans/ai-workflows/compare/v0.9.1...v0.9.2) (2026-03-06)


### Bug Fixes

* AI workflow safety & reliability ([#90](https://github.com/JacobPEvans/ai-workflows/issues/90) root cause + systemic hardening) ([#94](https://github.com/JacobPEvans/ai-workflows/issues/94)) ([2552dcc](https://github.com/JacobPEvans/ai-workflows/commit/2552dccbb92e41005f89bcdaf7afe652e948baca))

## [0.9.1](https://github.com/JacobPEvans/ai-workflows/compare/v0.9.0...v0.9.1) (2026-03-06)


### Bug Fixes

* never auto-cancel AI workflow runs ([#91](https://github.com/JacobPEvans/ai-workflows/issues/91)) ([ee95b06](https://github.com/JacobPEvans/ai-workflows/commit/ee95b066746621748e2a5845814bf1be9975ae79))

## [0.9.0](https://github.com/JacobPEvans/ai-workflows/compare/v0.8.0...v0.9.0) (2026-03-06)


### Features

* increase prompt scope, raise timeouts, and add ai-workflows dogfooding ([#83](https://github.com/JacobPEvans/ai-workflows/issues/83)) ([7afa3f7](https://github.com/JacobPEvans/ai-workflows/commit/7afa3f7633f9fa45daabe1668638e21cad45cb5f))


### Bug Fixes

* correct dogfood permissions and docs-review threshold ([#84](https://github.com/JacobPEvans/ai-workflows/issues/84)) ([0a2e6b7](https://github.com/JacobPEvans/ai-workflows/commit/0a2e6b74dcab67f8ee9854f8776c4399b42ce394))
* remove blanket auto-merge workflow ([#85](https://github.com/JacobPEvans/ai-workflows/issues/85)) ([aaa0ae7](https://github.com/JacobPEvans/ai-workflows/commit/aaa0ae76841e082e25214047082e55f0471eccf1))

## [0.8.0](https://github.com/JacobPEvans/ai-workflows/compare/v0.7.0...v0.8.0) (2026-03-05)


### Features

* add AI provenance footers and Slack PR notifications ([#75](https://github.com/JacobPEvans/ai-workflows/issues/75)) ([94d3c9c](https://github.com/JacobPEvans/ai-workflows/commit/94d3c9cf55e49cb89f9b8c7170b386c2cc131629))
* add suite grouping reusable workflows ([#72](https://github.com/JacobPEvans/ai-workflows/issues/72)) ([3924519](https://github.com/JacobPEvans/ai-workflows/commit/3924519482a87166e0d4337bf40e5df1c4b8411b))
* soft bot guard — skip instead of fail when bot creates PR ([#73](https://github.com/JacobPEvans/ai-workflows/issues/73)) ([8b26d6a](https://github.com/JacobPEvans/ai-workflows/commit/8b26d6ab5918f6a4c4d6bcb09132b752f0c15dd0))


### Bug Fixes

* add git write permissions, failure comments, and anti-loop ceilings ([#77](https://github.com/JacobPEvans/ai-workflows/issues/77)) ([6ccdb87](https://github.com/JacobPEvans/ai-workflows/commit/6ccdb873664997548b8dbbb14c4e46821969e977))
* add workflow_dispatch to all suite workflows and correct nesting limit comment ([#74](https://github.com/JacobPEvans/ai-workflows/issues/74)) ([5c84ebd](https://github.com/JacobPEvans/ai-workflows/commit/5c84ebd3cdd503b39ce7c123bdf99dc959a73c22))
* add workflow_dispatch trigger to release-please ([#79](https://github.com/JacobPEvans/ai-workflows/issues/79)) ([cf22534](https://github.com/JacobPEvans/ai-workflows/commit/cf225349a1b2aee5c2a483e3c00036e1a370128d))
* rename SLACK_WEBHOOK_URL secret to GH_SLACK_WEBHOOK_URL_GITHUB_AUTOMATION ([#76](https://github.com/JacobPEvans/ai-workflows/issues/76)) ([cc89482](https://github.com/JacobPEvans/ai-workflows/commit/cc8948286e2d6682a4b658a30b76b3823aa5fc05))

## [0.6.0](https://github.com/JacobPEvans/ai-workflows/compare/v0.5.1...v0.6.0) (2026-02-27)


### Features

* auto-enable squash merge on all PRs when opened ([#62](https://github.com/JacobPEvans/ai-workflows/issues/62)) ([f9eff8d](https://github.com/JacobPEvans/ai-workflows/commit/f9eff8d5a0676873270584e2da63f30a24d0ec65))
* **copilot:** Copilot coding agent + post-merge CI fail issue workflow ([#60](https://github.com/JacobPEvans/ai-workflows/issues/60)) ([bfb0f91](https://github.com/JacobPEvans/ai-workflows/commit/bfb0f9147b81d8f0a377d1af037180a4d992117a))

## [0.5.1](https://github.com/JacobPEvans/ai-workflows/compare/v0.5.0...v0.5.1) (2026-02-27)


### Bug Fixes

* **claude-review:** fix self-cancellation + add review limits ([#58](https://github.com/JacobPEvans/ai-workflows/issues/58)) ([1176a7f](https://github.com/JacobPEvans/ai-workflows/commit/1176a7f6a8c1d6681d2bbf6d21b37bfbc819c241))

## [0.5.0](https://github.com/JacobPEvans/ai-workflows/compare/v0.4.0...v0.5.0) (2026-02-26)


### Features

* **signing:** switch to API commit signing, remove draft PR mode ([#55](https://github.com/JacobPEvans/ai-workflows/issues/55)) ([7ec52b9](https://github.com/JacobPEvans/ai-workflows/commit/7ec52b9bb35768f999394235d08049a16f7870f9))

## [0.4.0](https://github.com/JacobPEvans/ai-workflows/compare/v0.3.3...v0.4.0) (2026-02-25)


### Features

* **issue-pipeline:** AI-created issue dispatch + daily resolver limit ([#53](https://github.com/JacobPEvans/ai-workflows/issues/53)) ([611f61b](https://github.com/JacobPEvans/ai-workflows/commit/611f61bf894de457a3679ceadf07efc9609d3117))

## [0.3.3](https://github.com/JacobPEvans/ai-workflows/compare/v0.3.2...v0.3.3) (2026-02-24)


### Bug Fixes

* **post-merge:** add dispatch pattern and bot guard ([#51](https://github.com/JacobPEvans/ai-workflows/issues/51)) ([eabd685](https://github.com/JacobPEvans/ai-workflows/commit/eabd685d570939af670732a1537bb8bae5029891))

## [0.3.2](https://github.com/JacobPEvans/ai-workflows/compare/v0.3.1...v0.3.2) (2026-02-24)


### Bug Fixes

* **e2e:** correct repo name from nix-config to nix ([#50](https://github.com/JacobPEvans/ai-workflows/issues/50)) ([6d8b83e](https://github.com/JacobPEvans/ai-workflows/commit/6d8b83e6d6537ff58c0d732ded76c4d2657eb5f6))
* **e2e:** filter wait_for_run by start time and use unique issue titles ([#47](https://github.com/JacobPEvans/ai-workflows/issues/47)) ([f7f069b](https://github.com/JacobPEvans/ai-workflows/commit/f7f069b8c112fafb6e1eef37b7d26fa4a4d6cb81))
* **e2e:** use technitium_dns README as test issue topic ([#49](https://github.com/JacobPEvans/ai-workflows/issues/49)) ([7e56a8b](https://github.com/JacobPEvans/ai-workflows/commit/7e56a8b27ff24a9b04a76951ab17f87a58c863a6))

## [0.3.1](https://github.com/JacobPEvans/ai-workflows/compare/v0.3.0...v0.3.1) (2026-02-23)


### Bug Fixes

* **triage:** apply size:* and priority:* labels per label policy ([da8fc05](https://github.com/JacobPEvans/ai-workflows/commit/da8fc0523a21e9335c0f3b4933cce93c267edb35))

## [0.3.0](https://github.com/JacobPEvans/ai-workflows/compare/v0.2.9...v0.3.0) (2026-02-23)


### Features

* migrate all workflows to claude-code-action@v1 with OIDC auth ([32160f9](https://github.com/JacobPEvans/ai-workflows/commit/32160f97fda88ef1465fada6aa2ae70030013ab9))

## [0.2.9](https://github.com/JacobPEvans/ai-workflows/compare/v0.2.8...v0.2.9) (2026-02-21)


### Bug Fixes

* use Claude's SSH signing key and default bot identity ([#40](https://github.com/JacobPEvans/ai-workflows/issues/40)) ([7257494](https://github.com/JacobPEvans/ai-workflows/commit/725749420ae347643e17b20a139590f5df6be4db))

## [0.2.8](https://github.com/JacobPEvans/ai-workflows/compare/v0.2.7...v0.2.8) (2026-02-21)


### Bug Fixes

* switch to SSH commit signing for agent-mode workflows ([#38](https://github.com/JacobPEvans/ai-workflows/issues/38)) ([a6fdea8](https://github.com/JacobPEvans/ai-workflows/commit/a6fdea86cff7d3a2d430acba497148f83aa7850b))

## [0.2.7](https://github.com/JacobPEvans/ai-workflows/compare/v0.2.6...v0.2.7) (2026-02-21)


### Bug Fixes

* enable commit signing and migrate triage to v1 action ([#36](https://github.com/JacobPEvans/ai-workflows/issues/36)) ([ec1df59](https://github.com/JacobPEvans/ai-workflows/commit/ec1df5992c1b5ac032e2fcd77e23d5b1e86c7083))

## [0.2.6](https://github.com/JacobPEvans/ai-workflows/compare/v0.2.5...v0.2.6) (2026-02-20)


### Bug Fixes

* migrate claude-code-action inputs and bump action versions ([#34](https://github.com/JacobPEvans/ai-workflows/issues/34)) ([6bb0823](https://github.com/JacobPEvans/ai-workflows/commit/6bb0823b7ab76bfa12f782f38ac578146e6ef969))

## [0.2.5](https://github.com/JacobPEvans/ai-workflows/compare/v0.2.4...v0.2.5) (2026-02-20)


### Bug Fixes

* change issue-resolver inputs from type:number to type:string ([#32](https://github.com/JacobPEvans/ai-workflows/issues/32)) ([ec031ab](https://github.com/JacobPEvans/ai-workflows/commit/ec031aba31f54f89c522bc8b29734a00f3f57cc3))

## [0.2.4](https://github.com/JacobPEvans/ai-workflows/compare/v0.2.3...v0.2.4) (2026-02-20)


### Bug Fixes

* remove inputs context from concurrency group in issue-resolver ([#30](https://github.com/JacobPEvans/ai-workflows/issues/30)) ([f954ad6](https://github.com/JacobPEvans/ai-workflows/commit/f954ad666ae69c79ce58f376392cee3b97a90924))

## [0.2.3](https://github.com/JacobPEvans/ai-workflows/compare/v0.2.2...v0.2.3) (2026-02-20)


### Bug Fixes

* replace permissions: {} with explicit permissions on all reusable workflows ([#28](https://github.com/JacobPEvans/ai-workflows/issues/28)) ([0849d64](https://github.com/JacobPEvans/ai-workflows/commit/0849d649e4c878873ba975d11f2190a8de912abf))

## [0.2.2](https://github.com/JacobPEvans/ai-workflows/compare/v0.2.1...v0.2.2) (2026-02-20)


### Bug Fixes

* remove sender.type bot check from reusable workflow jobs ([#26](https://github.com/JacobPEvans/ai-workflows/issues/26)) ([603e293](https://github.com/JacobPEvans/ai-workflows/commit/603e2934e4b06284ca8904b13026ffc907ed3bb7))

## [0.2.1](https://github.com/JacobPEvans/ai-workflows/compare/v0.2.0...v0.2.1) (2026-02-20)


### Bug Fixes

* replace permissions: {} with explicit permissions on issue workflows ([#24](https://github.com/JacobPEvans/ai-workflows/issues/24)) ([65f63a0](https://github.com/JacobPEvans/ai-workflows/commit/65f63a0e702950e6b1edbc165eb14cd7a2138b26))

## [0.2.0](https://github.com/JacobPEvans/ai-workflows/compare/v0.1.0...v0.2.0) (2026-02-20)


### Features

* add issue-resolver reusable workflow ([#20](https://github.com/JacobPEvans/ai-workflows/issues/20)) ([d05bc90](https://github.com/JacobPEvans/ai-workflows/commit/d05bc90117c4ceea617a13f68e58dc8e4f274f39))
* add manual dispatch and spam prevention to issue-resolver ([#21](https://github.com/JacobPEvans/ai-workflows/issues/21)) ([1785b16](https://github.com/JacobPEvans/ai-workflows/commit/1785b1629325c130d64d4b869530fd34bb54f279))


### Bug Fixes

* add packages key to release-please config for manifest strategy ([#22](https://github.com/JacobPEvans/ai-workflows/issues/22)) ([0620a9e](https://github.com/JacobPEvans/ai-workflows/commit/0620a9e2e54e86c3a34b9b92667be3a59c9b6fa1))
* rename release-please config file and enhance config ([#18](https://github.com/JacobPEvans/ai-workflows/issues/18)) ([7d8af0c](https://github.com/JacobPEvans/ai-workflows/commit/7d8af0cfd15bb1c5f2ac4b024b8337b9fa563ace))

## [0.1.0](https://github.com/JacobPEvans/ai-workflows/compare/v0.0.1...v0.1.0) (2026-02-18)


### Features

* add Next Steps daily workflow and momentum analysis ([#9](https://github.com/JacobPEvans/ai-workflows/issues/9)) ([564a984](https://github.com/JacobPEvans/ai-workflows/commit/564a984a538dffbf1dc05a9c2beca5b9e2e5adf0))
* add Phase 2 workflows — final PR review, post-merge tests, post-merge docs ([#11](https://github.com/JacobPEvans/ai-workflows/issues/11)) ([bfe0d30](https://github.com/JacobPEvans/ai-workflows/commit/bfe0d30151d3f5ac220c5f53dba0715b59fc6df7))
* add Phase 3 workflows — best practices recommender, issue hygiene ([#12](https://github.com/JacobPEvans/ai-workflows/issues/12)) ([292b457](https://github.com/JacobPEvans/ai-workflows/commit/292b45793eb7d4b7b336e2c16df72f7b5c7971c9))
* convert to reusable workflows for v0.1.0 ([#13](https://github.com/JacobPEvans/ai-workflows/issues/13)) ([6de2ce8](https://github.com/JacobPEvans/ai-workflows/commit/6de2ce8e9a90add7f9d8eeee5165f88af75f8d39))
* release pipeline, HIGH security fixes, MCP tool trim, version bump ([#15](https://github.com/JacobPEvans/ai-workflows/issues/15)) ([da8a0ab](https://github.com/JacobPEvans/ai-workflows/commit/da8a0ab9dc6351d70abd3386552d12434faa40ea))


### Bug Fixes

* skip all workflows when triggered by a bot actor ([#14](https://github.com/JacobPEvans/ai-workflows/issues/14)) ([be4fe8d](https://github.com/JacobPEvans/ai-workflows/commit/be4fe8dc4039d4c4b625524b89c59974fb14021d))

## [0.0.1] - 2026-02-14

### Added

- 6 gh-aw workflows: issue-sweeper, issue-triage, code-simplifier, label-sync, project-router, repo-orchestrator
- 3 custom agents: issue-analyst, dry-enforcer, label-expert
- 4 shared importable components: github-read tools, label-policy config, dry-principles prompt, issue-analysis prompt
- README with workflow catalog and import instructions
- CONTRIBUTING, SECURITY, and LICENSE files
- Documentation: getting started guide and patterns reference
