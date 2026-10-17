# Changelog

## [0.1.1](https://github.com/chamberu/chamberu/compare/core-v0.1.0...core-v0.1.1) (2026-10-17)


### Features

* **core:** add agent and trigger definitions ([bb824d4](https://github.com/chamberu/chamberu/commit/bb824d463c5987ba0d934f4af105733762ec2874))
* **core:** add agent state and state tools ([f49c6d5](https://github.com/chamberu/chamberu/commit/f49c6d5edda931c4c2d97f6dfd269705e9df9358))
* **core:** add approval pauses with signed resume tokens ([10db0bd](https://github.com/chamberu/chamberu/commit/10db0bdc9978424924738f9512d17b3c8f7c674c))
* **core:** add effect tools with reconciliation ([4a21332](https://github.com/chamberu/chamberu/commit/4a21332d31285ff4516ad094ae41687ae18fccf7))
* **core:** add recovery and graceful drain ([3ca1f99](https://github.com/chamberu/chamberu/commit/3ca1f99eeca9cdc8c9dfb85e7e95fdc79e9342d5))
* **core:** add run dispatch with idempotency and concurrency ([ca77998](https://github.com/chamberu/chamberu/commit/ca77998be128e11f72711779ec02097e1640988e))
* **core:** add store contract and memory store ([ad1e403](https://github.com/chamberu/chamberu/commit/ad1e403d33d9e1a6fc963a7d8ceafe22c210ba88))
* **core:** execute runs with step checkpoints and budgets ([46d62aa](https://github.com/chamberu/chamberu/commit/46d62aa52ec2d1fc1f06912ce472635f67e323d9))
* **core:** expose public api ([40c3292](https://github.com/chamberu/chamberu/commit/40c329232d5dbb4d747f85822558084fdf2eff8a))


### Bug Fixes

* **core:** accept payload-typed triggers in agent definitions ([5944161](https://github.com/chamberu/chamberu/commit/5944161ab978cdaf7575eb842f2020ffb7c6ea7d))
* **core:** cancel runs executing on other replicas and runs caught mid-pause ([de01cd8](https://github.com/chamberu/chamberu/commit/de01cd80e19ce2c509f0ddb95d6cd6400775faf6))
* **core:** copy values in memory store and extend store contract ([9d10208](https://github.com/chamberu/chamberu/commit/9d102082a142c48f7d24a603c3c5870ab083bdcc))
* **core:** harden effect hashing, recording failures and key errors ([bc92a8c](https://github.com/chamberu/chamberu/commit/bc92a8c52dae10064a12d7006658df22425148f8))
* **core:** heal an idempotency key whose run was never created ([bb2e715](https://github.com/chamberu/chamberu/commit/bb2e715577f09ab33a5caa4567dfc648ab8132e0))
* **core:** keep interrupted runs blocking their concurrency key ([54b5e29](https://github.com/chamberu/chamberu/commit/54b5e299dfbd233a6aa35b59f9f016bde41ab1ed))
* **core:** keep resume tokens valid across crashes and honour approvals on the last step ([f76f199](https://github.com/chamberu/chamberu/commit/f76f19903c22a168aa033ca4e941948c9757c1d3))
* **core:** keep run transitions safe when lock release fails and poll restarts ([f6309b7](https://github.com/chamberu/chamberu/commit/f6309b74f00894700838e2070249b28a7da2716e))
* **core:** make keyed dispatch atomic across replicas and harden the queue ([20bccdd](https://github.com/chamberu/chamberu/commit/20bccdd3733feced8f13dfe7e1068a52a07a0361))
* **core:** persist a completed step when a drain aborts during its writes ([095fe1d](https://github.com/chamberu/chamberu/commit/095fe1d5c0eaf7707e67b0076f7c1daeb437a3fc))
* **core:** reject duplicate agent names and an empty resume secret ([a8142b0](https://github.com/chamberu/chamberu/commit/a8142b0846284e63e3b1f1d5abf9bd38a54a2454))
* **core:** retry undelivered approval notifications on every poll ([02509cc](https://github.com/chamberu/chamberu/commit/02509cc411ea6b795ecbec861c52ba14ff591015))
* **core:** stop abandoned executions from writing and feed tool errors back to the model ([e6e56ab](https://github.com/chamberu/chamberu/commit/e6e56ab14bc8a4d0c8169af5f3ad4b6a69b2724e))
