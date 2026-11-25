/** Private source-only bridge, NOT a new approval, sender, timer, retry or consent.
 * Old envelopes are never rewritten. Main review verification MUST still verify their
 * original HMAC, actor and payload, and enforce allowedMessageIds at claim AND attempt.
 * No eager import of the main review adapter (its source identity includes this file).
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { ENV } from './_core/env';
import release from '../shared/outreachRepairRelease.json';
import { hustleExistingSigningAuthority } from './hustleSigningAuthority';
import { isHustleManagedOperatorActor } from './hustleManagedOperatorGrant';
import { assertFinalOriginalHistoricalEvents } from './hustlePartialContinuation';
import { sponsoredCanonicalJson, getHustleSponsoredFollowupAt,
  HUSTLE_SPONSORED_CONFIG_VERSION, HUSTLE_SPONSORED_SLUG, HUSTLE_SPONSORED_HEADERS,
  HUSTLE_SPONSORED_FROM_DISPLAY, HUSTLE_SPONSORED_POLICY, HUSTLE_SPONSORED_MAX_AGE_MS,
  sponsoredReviewRecordSchema, sponsoredRecordBlockers } from '../shared/hustleSponsoredReview';

type Row = Record<string, any>;
export const hustleSourceTransitionHash = (v: unknown): string => createHash('sha256').update(sponsoredCanonicalJson(v)).digest('hex');
export const hustleSourceTransitionByteHash = (v: string): string => createHash('sha256').update(v, 'utf8').digest('hex');
/** Noncredential source map and SHA256 pins only; no contact bytes or signatures. */
export const HUSTLE_SOURCE_TRANSITION_PINS = Object.freeze({
  "originatingTaskId": "wYxXaeCb15BTQVjEmz9GMN",
  "executionTaskId": "c56yJvFkzrx3K3dvrdOjiK",
  "projectId": "W4ntUZHSievw5UuCde7zzr",
  "userId": "310519663569963942",
  "fixMessageId": "m2rQ2aZz7yMuKvEKyKmspi",
  "fixTimestampMs": 1795282632252,
  "fixContentSha256": "25fc6e5c3d35793a24b97c5ed0f5068893fe4cd6cd4d0b20bad199c0c2718644",
  "receiptKey": "hustle-source-transition:2026-11-21:original-four-fu2:v1",
  "receiptType": "hustle_source_transition_receipt",
  "reviewId": "b36d1890e82fe703f197f0943bd7cecdcab0a4ee70a36897",
  "schedulerTaskUid": "BiaYdVKZ9Y85mhJ6NuD4Gw",
  "prospectIds": [
    210001,
    480001,
    210010,
    240001,
    240003
  ],
  "consentExpiresAt": 1797704949408,
  "cancelled90014RowHash": "208e343a76b92b98d812a1e1a74e0f6a7d1378f32bb04e3c165c785aaaa20947",
  "originalActorHash": "4ff1554f868c8f77e4fc5869fa3a22f43f466692bd2eced09f95200b374ef60a",
  "repairProofHash": "d4234883895739f8e193d40ed97186322b3d8fea1d85ceb1c5a277baa18b5b5f",
  "baselineFileSha256": "8c63e22bed299c5009f3c0036af6685cabc7b96e1c4789e02b02f910d115ef73",
  "historicalEventsHash": "253daf6d46529b260e595f3a8d0292544d71d15aa513149e17ad631d0a0f9412",
  "originalMessagesHash": "28c3a3fda937294f5760f916b04734f760d1ca3826ab92aa24aa45fb4e3fcce3",
  "oldSourceHash": "93ff8dd30d38883aacee44a86da8ba00f4be5aadeda050e4862970dd52578b0d",
  "oldSourceMapHash": "0eb2d84270fe3ac608e4acd48fc4eccbdf09da59d2f04c81b3842f24b3dbc40c",
  "campaignBindingHash": "7c3c6be7b8aa32b7388abf58e32089953f4f59cab8ab533e108a8b8180a3c178",
  "allowedMessageIds": [
    90003,
    90006,
    90009,
    90012
  ]
});
export const HUSTLE_SOURCE_TRANSITION_OLD_SOURCE_HASHES: Readonly<Record<string,string>> = Object.freeze({
  "client/src/components/HustleOutreachPipeline.tsx": "f9b8f8d97aead35473ca59db0825ff71ac2467d974d92c54522052082beab300",
  "client/src/components/HustleSponsoredReviewPanel.tsx": "88aa03ee5f7acaf42f8ad04bc969ba0041ed8054459e13eaf1ef56fc79db7e53",
  "drizzle/schema.ts": "39c66057f02a03788de5f9f3c9d5b24a7484b8db54e3d7a52f52613366500fef",
  "research/outbound-low-supply-monitor-2026-11-05.js": "fe0237fb61d8bca6d8726217f2b168a797d6250b160c613ee9ed76e1d6364cfd",
  "research/training-owned-replenishment-instruction-2026-11-06.md": "66570c8e7f0692f78aa5e3683b33d45c96bcaa3ef7a0eabe186feba7cd90d66c",
  "scripts/activate-hustle-campaign-2026-11-05.ts": "1e491158df73056b7379cdff3a77c37bc59fbc54d4b5f75d61541e78fb1b6c08",
  "scripts/activate-sector-campaigns-2026-11-05.ts": "10d34ae543bf77f562fdd555ded04cd425808e3d90faa268cad3c1ddc9da21c4",
  "scripts/finalize-outreach-repair-release-2026-11-05.ts": "b625bf5a678da879188497993ffe8410bad401f61918e9be11bb724daadf4409",
  "scripts/hustle-replenishment.ts": "7fdae1941cb3571f62c1ead092d35e81b22a70877e03da14e9a936fb57ccd5b7",
  "scripts/hustle-task-first-batch-continuation.ts": "1729541524681a9e7f4bce035f775c013a39c69c7ff90a275c43e36ddaa85ae0",
  "scripts/hustle-task-first-batch-recovery.ts": "5a063e23501aad102df7691b0591a1a1eb53ed2a042db33764022e4599d95302",
  "scripts/hustle-task-first-batch.ts": "8a6fa8681dbd1b46c0cdc1567222dc4004dc500f3d4f5a8aa3d351e66f31b197",
  "scripts/preview-sector-activation-2026-11-05.ts": "94e5fe01e42696ba07250c85a2790115d67627c0d165c397ba6c41154e9669da",
  "scripts/training-replenishment.ts": "467de7a21635acdac294d0d5ce9793ac9d5e58966252fe1397f69d3e45948047",
  "server/_core/context.ts": "a43ea9ca8624270a83857d61a7154f17c48bb2c19126d1ee037a37345f6bda86",
  "server/_core/env.ts": "15356c6c79afa61c60b20e126691853d07b51c48b9e57f205b7ce63dd02d622b",
  "server/_core/heartbeat.ts": "e9070208f34813a427d4a79207819acc2ac0d1de5244b4db55fe3a94bfe3f950",
  "server/_core/index.ts": "5363ed011633f6084e45802106fee23963000573689e246f8ac08e0004f3eacf",
  "server/_core/notification.ts": "550bf6544bf792b6d13c68539679deb363b70fbf07c0dbde189a98787f66f003",
  "server/_core/sdk.ts": "37a1087a6a69706b9ee2d6a1236db17d75c1640e35ae8c189def95b8ea33e0cd",
  "server/_core/types/manusTypes.ts": "d073995b792a4376177bf7270cbcf3a670d4e72efb8eb6a83ecb55043cc729c3",
  "server/brandVideoAutomation.ts": "67984aa9f625012a0ca315ba98b59e13d5705b5d16b0ce079b73ad8c19d9c502",
  "server/brandVideoControls.ts": "f4025a7c0d2e0e85886e885955a6ed0ffca4c5dadeb0a5b844c2140c99abfd3b",
  "server/brandVideoInbox.ts": "973141723725934dd5884677db219d75875641db1a17ae797f2b040e4131600f",
  "server/brandVideoSendingDb.ts": "b7649a961dbbd56a95025c496820001b23058609a3d692b36390ed9aaa14c62f",
  "server/db.ts": "659dae678938cac1ce9c8d0e58661f24b56327925193df7a6d2449aa1caf80d9",
  "server/hustleActivation.ts": "fd16be9ceb3bae07c910122308d44d46c68798a2469ba7b4468eef3f3384b302",
  "server/hustleAutomation.ts": "fedfd62fdd4c66b4045be57be37d81e9c302463d3c658210862392164c162bce",
  "server/hustleBeforeClaimRecovery.ts": "1d703c4193c2765e7c7bed9fcccadd6cde80ce7b9199445b2941935bbd84f0d1",
  "server/hustleDb.ts": "eecb7750dfad62d71e4ff246f8d41943f5008834d38af55c81c6e0ea83bb6d8c",
  "server/hustleEmail.ts": "45886d19c7d7a6bbb596223b6f77e3ab338848701bf73e70512d066f5f0453c9",
  "server/hustleExactPayloadApproval.ts": "325f08013d50321c2e959fee389c1b5ce66eb45b3be5fd6b6128bb9109d7e680",
  "server/hustleFirstBatch.ts": "f0d6bbe4a041820638dd1823f3c5f3bc69429885b020d65d02407f2fe66dc055",
  "server/hustleInbox.ts": "c7c72c0885ac6431fd72b596ccdc80044a8a8ff7d553ec5d89659bec37b3d341",
  "server/hustleLateStartAuthorization.ts": "a445501c0adda210f5b1ef3931cae9e6ad30be51f6799cc98a9f182142b52c79",
  "server/hustleManagedOperatorGrant.ts": "8fc9a3f389d4a58cbe697a01026084ae2348e05bfbf5f6ed66ab6dc88ac4a473",
  "server/hustlePartialContinuation.ts": "c750a34aaf19ab337741eabf0c9bf218d174e4e031a2fcbb13cc5bb4fc2aa29a",
  "server/hustleRecap.ts": "0e4dffc4bf93aeacfe64646cb3c69fec3b03e9a4cec6313d5d6167c2b4be68cc",
  "server/hustleSigningAuthority.ts": "84ae7508d76855e9256540b3b0be213dd1aeebda526dc27e9bf5048a402f7be9",
  "server/hustleSourceIdentity.ts": "4acec7f992e57b83ed5821c39334083d40ba388339b144a2235c9a68e748d25c",
  "server/hustleSponsoredReviewDb.ts": "2dedc231a3ecde7968032624dce5b1d396d4e67c4d011337ee99554f375e95dc",
  "server/hustleSponsoredRuntime.ts": "3e89ed46c4f4aef8dbbff055eca89ed8b354a83469158e1368e016652ab2ca69",
  "server/hustleTaskFirstBatch.ts": "3d960d563826765750f05be23194ec1d25c654bfff54ee73b7888ae943dd958d",
  "server/inquiryEmail.ts": "9d142b8d0a15006e46af1c3bc55eca6854226bd7285f69b649933dfa3171a09f",
  "server/outreachAlertReadiness.ts": "aafc448da59866535e10c2f577e7e9c3e0695a2269d8d570dd7301fa2119af64",
  "server/outreachAutomation.ts": "1e4bb7d68d5e2b65c43261e37ac6fcdbf9347137d109e51f77ee39ac38cdb2fc",
  "server/outreachControls.ts": "d5904cf04c88a6fe01227bdf3d05a4c554b9cba527f505b8272b8b897e91f33c",
  "server/outreachDb.ts": "710e9d0abf42a899d1669806ebe82be171ff3916b93976a8ff28b64a37880b54",
  "server/outreachDeadline.ts": "e7b352c96a2b7d189a69820ad9e9641590020fa1b7517b3ce44eb40738da1728",
  "server/outreachInbox.ts": "2612089584ffa636f3a39ac5781252a57a45e0b528d5027917358bf5def11d05",
  "server/outreachRecap.ts": "055296b33beedddd937ae34fb31479ef6f72cec4c08c902ef3626bd596a1658b",
  "server/outreachResearch.ts": "852dedae93f0b9d20e51e0ae56e42b1c2507eaa17062616fa8ff6dd0995de80d",
  "server/routers.ts": "53c64922c4a1442fab07c744af3c0d187bb56a68bcc4b9383a78ef89ed23f8dc",
  "server/routers/hustle.ts": "e13754ceafa163c151cf208a420291998b8d9b9152f1fb6045b6c104b85fbde3",
  "server/routers/outreachRepairs.ts": "c5289657170455e73ca32c7545733e75dfceb58b5cba165d8963199b50795d45",
  "server/sectorActivation.ts": "e29fc45a40aebd3d6632493c07ac7e521da4609c4f6e6643871a8516ba5295fa",
  "server/sectorAutomation.ts": "021df3101702c4ce294f633ed6cfcbeebb93f92de416e704dda3c5d96c5edcb7",
  "server/sectorCrossCampaignGuard.ts": "a37fedcf0db1962f3cf43cdc9ccbc47ca6135d56ce4cf1cdf165c149f57d82b8",
  "server/sectorEmail.ts": "2161dc0614e2e5219ff7ce6968d75c65627ccf2dfc017803f39d2e2e2fe1d5ea",
  "server/sectorInbox.ts": "1dfaff829db0e5997fdb10bea49e0bbf6b8f015ad789cde8ed6eef07115eddf6",
  "server/sectorRecap.ts": "c6f85be37ffa719c3f29a92f0aa6021bbe82bc37d4751cf61730a313d138cf95",
  "server/sectorRuntimeDb.ts": "458accb5c68efdc8a85b500bf155940d4b2a078413bdf187f0c0b344e66b42d3",
  "server/trainingAutomation.ts": "b19d53417c185d7c9ce18983f7a3acbffb3186e52f41ffa1f17ae77fa569b869",
  "server/trainingControls.ts": "04fb2885eaa11db554a4abc479cf2f159f246246531875e920e63449e840a526",
  "server/trainingResearch.ts": "8d8c07a08ea76a8b6b43a097e1d8a2bf7ab07ba028c52715a2f96242ca9260d2",
  "server/trainingResearchExclusions.ts": "2d93dc645fcbf28acb499570b4993221049d5813d235313261c8c552da045e3b",
  "server/trainingResearchLifecycle.ts": "9f87fcdf6bd331de0bbef6ef808a1ed2f49478350a3816ae9dbb9671c544f0ea",
  "server/trainingSendingDb.ts": "a714ebeee67dabb1ee495ab2c1fae3dafcf46c947cb4278549ba594fc106c6ce",
  "shared/blueprintGrowthPlan.ts": "cf04b9b9f10ff3ea235178b285ef72228af4964c238b341fad0d392ea119fa55",
  "shared/brandVideoOutreach.ts": "c6c8e2c658db677c966dff811625e281bafc25af19eed19e249fa7228d593f0a",
  "shared/chamberChecklist.ts": "7b02f015d70a65b1175ed200d4b24ab5c547e454df98173eae015c1e590d40c9",
  "shared/chamberPlan.ts": "feb29e336f466c204b9730a8492043387767272b70f5c4950a7e9beb666e501d",
  "shared/chamberProspects.ts": "4395de4d087e654a36c7a9ced7e8bc89ff7331283bdf75c65fa2d13ab9e1b653",
  "shared/const.ts": "de374b51dc1c0dc4703901f82b790b77ae10644ee3e790b06e904d7fb9d91330",
  "shared/conversationOfferPlan.ts": "79897675dfca34de538a88bfb55e77c535ae66e4127eb061b7f071a85c4a12ec",
  "shared/growthChecklist.ts": "16ee4200f5643c22cb132df295673024e8254021a8a2e6c1e1f67f268c2c55c8",
  "shared/growthDailyPlan.ts": "ead6f3be92981392e379f70fed94176ea0d1f2fc735e5c33923862a30582a261",
  "shared/growthPlan.ts": "9b7b60bf689b8ef087ac0c9c3a6e841a40c2fbc30d40c6db4840e2ff3f9fe1ed",
  "shared/hustleOutreach.ts": "b4fb9ce45bd8297057767a2b537bcbefd123ede5ba6452662ac6faa7c0fc8859",
  "shared/hustleSponsoredReview.ts": "3775e0edb437a28868b9d577850a373f852933d797db0bf22ceb46843c20563e",
  "shared/linkedinPriorityPlan.ts": "53e7c5f2fc65ae7ac8aeb7b21ada6854b6b4850e6a5cd4ced51d2dcd1d21756f",
  "shared/localAuthorityTasks.ts": "826e50dd1eb210abdf1de48273a70c0f43c41fda4c223fe6813c1728a177fd01",
  "shared/outboundReplenishmentPolicy.ts": "0ce087d5af5de3a37556c8e7880e080e72e12eb4195cbb9b8029e9972e2ffa4b",
  "shared/outreachFormatting.ts": "978f79d70b267b9e4989842e45b7888c33415d5ff5169135ce6a497d430e6c10",
  "shared/outreachMaintenance.ts": "1634b0f71e3ba094642f012f7adf7f14f863cecc01ea70e3e22d8bd07b3d9d2f",
  "shared/outreachResearchWindow.ts": "66105880c641d7fa32d255367eafdd8d24f631d3ba0e77ac891ace34932cd337",
  "shared/outreachReserveRefill.ts": "bf5aa69cff357369de85cafa368c148a548d82459e209e3313c0f22b7d6be92c",
  "shared/outreachSchedule.ts": "8ec12f6e286cbf846c05b4cf53935a54c7111d32f17b59007100d68c7b5e9180",
  "shared/personnelPolicy.ts": "183864e5c898b3001269bd06ac99f661f86fce739f01bf2674d90542dbb1b058",
  "shared/sectorOutreach.ts": "43f07c786abceb450ebaeaa0f6915c0dd65e7805e91af0d8c6eafadb87f8af51",
  "shared/sectorResearch.ts": "50f326a0ee019a21387c3b6013ee4da71613562243f26e18ea48a76b2bea1023",
  "shared/trainingOutreach.ts": "481146104e01074e2e01663c409847c384f999adc7c5737fad80207119f0f256",
  "shared/trainingResearch.ts": "0de7c7d2c34ee1884203c57d32c7952c56638735a70658d2cf6fb5413938c4e7",
  "shared/trainingResearchLifecycle.ts": "a1ad50b8728d6dfd1c03f3e821cb18d8e6da212b1e60d8893bc51ec7e9458243"
});
export const HUSTLE_SOURCE_TRANSITION_OLD_ENVELOPES: Readonly<Record<string,{eventType:string;detailSha256:string;oldSourceHash:string}>> = Object.freeze({
  "hustle-sponsored-review:b36d1890e82fe703f197f0943bd7cecdcab0a4ee70a36897:0": {
    "eventType": "hustle_sponsored_review_record",
    "detailSha256": "8aa2706812423a181c8b9884c924481b4ea79b96b5c7f8d263273a8e94ccc438",
    "oldSourceHash": "93ff8dd30d38883aacee44a86da8ba00f4be5aadeda050e4862970dd52578b0d"
  },
  "hustle-sponsored-review:b36d1890e82fe703f197f0943bd7cecdcab0a4ee70a36897:1": {
    "eventType": "hustle_sponsored_review_record",
    "detailSha256": "1e13976e68358718ccccf6a782b3051572455b8461a568edf2fa032b04a1e743",
    "oldSourceHash": "93ff8dd30d38883aacee44a86da8ba00f4be5aadeda050e4862970dd52578b0d"
  },
  "hustle-sponsored-review:b36d1890e82fe703f197f0943bd7cecdcab0a4ee70a36897:2": {
    "eventType": "hustle_sponsored_review_record",
    "detailSha256": "6c3a7ee142da0aaa938843757b6650aa7c4ae1ad3011c8d47e8da66e4d37e56d",
    "oldSourceHash": "93ff8dd30d38883aacee44a86da8ba00f4be5aadeda050e4862970dd52578b0d"
  },
  "hustle-sponsored-review:b36d1890e82fe703f197f0943bd7cecdcab0a4ee70a36897:3": {
    "eventType": "hustle_sponsored_review_record",
    "detailSha256": "0f83de9b3a936f3ae3730634387be7fd939b22c690158a71f62cf6c81f77230f",
    "oldSourceHash": "93ff8dd30d38883aacee44a86da8ba00f4be5aadeda050e4862970dd52578b0d"
  },
  "hustle-sponsored-review:b36d1890e82fe703f197f0943bd7cecdcab0a4ee70a36897:4": {
    "eventType": "hustle_sponsored_review_record",
    "detailSha256": "80a34ac744c2141d6664d5577caf68d23b26cc4c035aa95b4f44e914dc0fcc10",
    "oldSourceHash": "93ff8dd30d38883aacee44a86da8ba00f4be5aadeda050e4862970dd52578b0d"
  },
  "hustle-first-batch-final-original:2026-11-19:90013:v1:stage": {
    "eventType": "hustle_sponsored_review_manifest",
    "detailSha256": "e5b3f16139ac3dc8c5fdcacb078231456ec64950cb8b75d28a1fe741b43db29f",
    "oldSourceHash": "93ff8dd30d38883aacee44a86da8ba00f4be5aadeda050e4862970dd52578b0d"
  },
  "hustle-sponsored-authorization:b36d1890e82fe703f197f0943bd7cecdcab0a4ee70a36897:210001": {
    "eventType": "hustle_sponsored_exact_approval",
    "detailSha256": "bed04d6bacd237566e70f7584ce856fecf2ed7b4cbebb963077459ff0b39bc43",
    "oldSourceHash": "93ff8dd30d38883aacee44a86da8ba00f4be5aadeda050e4862970dd52578b0d"
  },
  "hustle-sponsored-authorization:b36d1890e82fe703f197f0943bd7cecdcab0a4ee70a36897:480001": {
    "eventType": "hustle_sponsored_exact_approval",
    "detailSha256": "078ac66d72172b5b26cc730f3d84d06ee9f40059b899094f02e0faf8d60eda7d",
    "oldSourceHash": "93ff8dd30d38883aacee44a86da8ba00f4be5aadeda050e4862970dd52578b0d"
  },
  "hustle-sponsored-authorization:b36d1890e82fe703f197f0943bd7cecdcab0a4ee70a36897:210010": {
    "eventType": "hustle_sponsored_exact_approval",
    "detailSha256": "962f81bca9c1935357468663718a531951ef07382b8e126d1e1e4579a0caa48c",
    "oldSourceHash": "93ff8dd30d38883aacee44a86da8ba00f4be5aadeda050e4862970dd52578b0d"
  },
  "hustle-sponsored-authorization:b36d1890e82fe703f197f0943bd7cecdcab0a4ee70a36897:240001": {
    "eventType": "hustle_sponsored_exact_approval",
    "detailSha256": "7efbdfe35989a5dd02a4d9bcec14bc71ef6c609853ffa4e510a97881a6b14f88",
    "oldSourceHash": "93ff8dd30d38883aacee44a86da8ba00f4be5aadeda050e4862970dd52578b0d"
  },
  "hustle-sponsored-authorization:b36d1890e82fe703f197f0943bd7cecdcab0a4ee70a36897:240003": {
    "eventType": "hustle_sponsored_exact_approval",
    "detailSha256": "725614685ccd649a4e61051e1d04a1c31f95efb1bafe0b7297b406c09645596d",
    "oldSourceHash": "93ff8dd30d38883aacee44a86da8ba00f4be5aadeda050e4862970dd52578b0d"
  },
  "hustle-sponsored-policy:b36d1890e82fe703f197f0943bd7cecdcab0a4ee70a36897": {
    "eventType": "hustle_sponsored_policy_approval",
    "detailSha256": "9c4b2d8e0af782f945a5ba3a989c13ce1227a9c89059e2afc12c994734065061",
    "oldSourceHash": "93ff8dd30d38883aacee44a86da8ba00f4be5aadeda050e4862970dd52578b0d"
  },
  "hustle-sponsored-approved:b36d1890e82fe703f197f0943bd7cecdcab0a4ee70a36897": {
    "eventType": "hustle_sponsored_approval_receipt",
    "detailSha256": "a6b21d3960a5488841470ce5a756d5dbfa4f138fce1ad34ad9461f6036d6b49b",
    "oldSourceHash": "93ff8dd30d38883aacee44a86da8ba00f4be5aadeda050e4862970dd52578b0d"
  },
  "hustle-first-batch-final-original:2026-11-19:90013:v1:manifest": {
    "eventType": "hustle_first_batch_task_manifest",
    "detailSha256": "d41257d32ca065281198edc812ce19d3796a27e767076fe3c0e4680981a3071d",
    "oldSourceHash": "93ff8dd30d38883aacee44a86da8ba00f4be5aadeda050e4862970dd52578b0d"
  },
  "hustle-first-batch-final-original:2026-11-19:90013:v1": {
    "eventType": "hustle_sponsored_partial_continuation_authority",
    "detailSha256": "a7423bce10a0b9b4a07da0212c1200c572b9afe46086a293b9f94e3d9f4298e3",
    "oldSourceHash": "93ff8dd30d38883aacee44a86da8ba00f4be5aadeda050e4862970dd52578b0d"
  },
  "hustle-first-batch-final-original:2026-11-19:90013:v1:intent": {
    "eventType": "hustle_first_batch_continuation_intent",
    "detailSha256": "828bb364989590a226f7dd7543e529a139ff1feb1d3f9099e3df03c8a9d41c14",
    "oldSourceHash": "93ff8dd30d38883aacee44a86da8ba00f4be5aadeda050e4862970dd52578b0d"
  },
  "hustle-first-batch-final-original:2026-11-19:90013:v1:result": {
    "eventType": "hustle_first_batch_continuation_result",
    "detailSha256": "4c4023410d9fdcedc6f6d9aefdf76d4ac457887113dd5971acc8c7a857eb7bda",
    "oldSourceHash": "93ff8dd30d38883aacee44a86da8ba00f4be5aadeda050e4862970dd52578b0d"
  }
});
export const HUSTLE_SOURCE_TRANSITION_BASELINE_EVENT_IDS: readonly number[] = Object.freeze([1, 30001, 60001, 90001, 90002, 120001, 120002, 150001, 150002, 180001, 180002, 210001, 240001, 270001, 270002, 300001, 330001, 360001, 360002, 360003, 390001, 420001, 420002, 420003, 420004, 420005, 450001, 480001, 510001, 540001, 570001, 600001, 630001, 660001, 660002, 690001, 720001, 750001, 750002, 780001, 810001, 840001, 840002, 870001, 870002, 900001, 900002, 930001, 960001, 990001, 1020001, 1050001, 1050002, 1050003, 1080001, 1110001, 1140001, 1170001, 1200001, 1200002, 1230001, 1230002, 1260001, 1290001, 1320001, 1320002, 1350001, 1380001, 1410001, 1410002, 1440001, 1440002, 1470001, 1500001, 1530001, 1560001, 1590001, 1620001, 1650001, 1680001, 1710001, 1740001, 1770001, 1800001, 1830001, 1830002, 1860001, 1860002, 1890001, 1920001, 1950001, 1980001, 2010001, 2040001, 2040002, 2070001, 2100001, 2130001, 2130002, 2160001, 2160002, 2190001, 2190002, 2220001, 2220002, 2250001, 2250002, 2280001, 2280002, 2310001, 2310002, 2340001, 2340002, 2370001, 2400001, 2430001, 2460001, 2490001, 2490002, 2490003, 2490004, 2490005, 2520001, 2520002, 2550001, 2550002, 2580001, 2580002, 2610001, 2610002, 2640001, 2640002, 2670001, 2670002, 2700001, 2700002, 2730001, 2730002, 2760001, 2760002, 2790001, 2790002, 2820001, 2820002, 2850001, 2850002, 2880001, 2880002, 2910001, 2910002, 2940001, 2940002, 2970001, 2970002, 3000001, 3000002, 3030001, 3030002, 3060001, 3060002, 3090001, 3090002, 3120001, 3150001, 3180001, 3180002, 3180003, 3210001, 3210002, 3240001, 3240002, 3270001, 3270002, 3300001, 3300002, 3330001, 3330002, 3360001, 3360002, 3360003, 3360004, 3360005, 3360006, 3360007, 3360008, 3360009, 3360010, 3360011, 3360012, 3360013, 3360014, 3360015, 3360016, 3390001, 3420001, 3420002, 3420003, 3420004, 3420005, 3420006, 3420007, 3420008, 3420009, 3420010, 3420011, 3420012, 3420013, 3420014, 3420015, 3420016, 3420017, 3420018, 3420019, 3420020, 3420021, 3420022, 3420023, 3450001, 3450002, 3480001, 3480002, 3480003, 3480004, 3480005, 3480006, 3480007, 3480008, 3480009, 3480010, 3480011, 3480012, 3480013, 3480014, 3480015, 3480016, 3480017, 3480018, 3480019, 3480020, 3480021, 3480022, 3480023, 3480024, 3480025, 3480026, 3480027, 3480028, 3480029, 3480030, 3510001, 3510002, 3510003, 3510004, 3510005, 3510006, 3510007, 3510008, 3510009, 3510010, 3510011, 3510012, 3510013, 3510014, 3510015, 3510016, 3510017, 3510018, 3510019, 3510020, 3510021, 3510022, 3540001, 3540002, 3540003, 3540004, 3540005, 3540006, 3540007, 3540008, 3540009, 3540010, 3540011, 3540012, 3540013, 3540014, 3540015, 3540016, 3540017, 3540018, 3540019, 3540020, 3540021, 3540022, 3540023, 3540024, 3540025, 3540026, 3540027, 3540028, 3540029, 3540030, 3540031, 3540032, 3540033, 3540034, 3540035, 3540036, 3540037, 3570001, 3570002, 3600001, 3600002, 3630001, 3630002, 3660001, 3660002, 3690001, 3690002, 3720001, 3720002, 3750001, 3780001, 3810001, 3810002, 3810003, 3840001, 3840002, 3870001, 3870002, 3900001, 3900002, 3930001, 3930002, 3960001, 3960002, 3990001, 3990002, 4020001, 4020002, 4050001, 4050002, 4080001, 4080002, 4110001, 4110002, 4140001, 4140002, 4170001, 4200001, 4230001, 4230002, 4230003, 4260001, 4260002, 4290001, 4290002, 4320001, 4320002]);

export const HUSTLE_SOURCE_TRANSITION_CHANGED_PATHS = Object.freeze([
  'server/outreachDeadline.ts', 'server/hustleAutomation.ts', 'server/outreachRecap.ts',
  'server/hustleSponsoredReviewDb.ts', 'server/hustleSourceIdentity.ts',
  'server/hustleSourceTransition.ts', 'scripts/hustle-source-transition.ts',
]);
const pins = HUSTLE_SOURCE_TRANSITION_PINS;
Object.freeze(pins.prospectIds); Object.freeze(pins.allowedMessageIds);
Object.values(HUSTLE_SOURCE_TRANSITION_OLD_ENVELOPES).forEach(Object.freeze);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const time = z.number().int().safe().positive();
const nonce = z.string().regex(/^[a-f0-9]{48}$/);
const map = z.record(z.string(), sha);
const directRecordSchema = z.object({
  id: z.literal(pins.fixMessageId), timestamp: z.literal(pins.fixTimestampMs), type: z.literal('user_message'),
  source_task: z.null(), user_message: z.object({ content: z.literal('Fix it '), source_task: z.null(),
    sender: z.object({ user_id: z.literal(pins.userId) }).strict() }).strict(),
}).strict();
const directSchema = z.object({
  verificationSource: z.literal('manus-tasks.list_task_messages'),
  taskId: z.literal(pins.originatingTaskId), messageId: z.literal(pins.fixMessageId),
  timestampMs: z.literal(pins.fixTimestampMs), userId: z.literal(pins.userId),
  role: z.literal('user'), contentSha256: z.literal(pins.fixContentSha256),
  verifiedAt: time, directRecord: directRecordSchema, directRecordSha256: sha,
}).strict();
export type HustleSourceTransitionDirectProof = z.infer<typeof directSchema>;
const productionSchema = z.object({
  verificationSource: z.literal('parent-cli-live-production-version'),
  url: z.literal('https://jeristotleproductions.com/api/trpc/outreachRepairs.version'),
  httpStatus: z.literal(200), production: z.literal(true), releaseId: z.string().min(1).max(200),
  sourceHashes: map, reportingSourceHashes: map.optional(), serverSourceHash: sha, verifiedAt: time,
}).strict();
export type HustleSourceTransitionProductionProof = z.infer<typeof productionSchema>;
export type HustleSourceTransitionSource = { currentCompleteSourceHash: string; currentSourceHashes: Record<string, string>; releaseId: string };
const unsignedGrantSchema = z.object({
  version: z.literal(1), purpose: z.literal('hustle-fixed-source-transition-only'),
  executionTaskId: z.literal(pins.executionTaskId), projectId: z.literal(pins.projectId),
  appId: z.literal(pins.projectId), campaignId: z.literal(1), grantId: nonce,
  oldSourceHash: z.literal(pins.oldSourceHash), oldSourceMapHash: z.literal(pins.oldSourceMapHash),
  repairProofHash: z.literal(pins.repairProofHash), currentCompleteSourceHash: sha,
  currentSourceMapHash: sha, issuedAt: time, expiresAt: time,
  directProof: directSchema, productionRelease: productionSchema,
}).strict();
const grantSchema = unsignedGrantSchema.extend({ seal: sha }).strict();
export type HustleSourceTransitionGrant = z.infer<typeof grantSchema>;
function mac(domain: 'grant' | 'receipt', v: unknown): string {
  return createHmac('sha256', hustleExistingSigningAuthority(ENV.cookieSecret))
    .update('jeristotle/hustle-source-transition/' + domain + '/v1\n')
    .update(sponsoredCanonicalJson(v)).digest('hex');
}
function validMac(supplied: unknown, expected: string): boolean {
  return typeof supplied === 'string' && /^[a-f0-9]{64}$/.test(supplied) &&
    timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'));
}
function environment() {
  if (ENV.appId !== pins.projectId || process.env.MANUS_WEBDEV_PROJECT_ID !== pins.projectId)
    throw new Error('Exact existing managed project/application required');
}
/** Complete old map is frozen, complete NEW map is passed by the current release.
 * Exactly two new production files; tests and release JSON are not self-hashed.
 * All 94 old entries remain, only the named five old implementation paths may change.
 */
export function assertHustleSourceTransitionSource(source: HustleSourceTransitionSource): void {
  sha.parse(source.currentCompleteSourceHash); const current = map.parse(source.currentSourceHashes);
  const old = HUSTLE_SOURCE_TRANSITION_OLD_SOURCE_HASHES;
  if (hustleSourceTransitionHash(old) !== pins.oldSourceMapHash || Object.keys(old).length !== 94 ||
    source.currentCompleteSourceHash === pins.oldSourceHash || !source.releaseId ||
    Object.keys(current).length !== 96 ||
    Object.keys(old).some(path => !Object.hasOwn(current, path)) ||
    Object.keys(current).some(path => !Object.hasOwn(old, path) && !['server/hustleSourceTransition.ts', 'scripts/hustle-source-transition.ts'].includes(path)) ||
    Object.entries(old).some(([path, digest]) => current[path] !== digest && !HUSTLE_SOURCE_TRANSITION_CHANGED_PATHS.includes(path)) ||
    ['server/hustleSourceTransition.ts', 'scripts/hustle-source-transition.ts'].some(path => !current[path]))
    throw new Error('Exact old94/new96 source map and fixed changed-path scope required');
}
function production(proof: HustleSourceTransitionProductionProof, source: HustleSourceTransitionSource, at: number) {
  assertHustleSourceTransitionSource(source);
  if (!release.production || proof.releaseId !== release.releaseId || proof.releaseId !== source.releaseId ||
    hustleSourceTransitionHash(source.currentSourceHashes) !== hustleSourceTransitionHash(release.sourceHashes) ||
    hustleSourceTransitionHash(proof.reportingSourceHashes ?? null) !== hustleSourceTransitionHash((release as Row).reportingSourceHashes ?? null) ||
    proof.serverSourceHash !== source.currentCompleteSourceHash ||
    hustleSourceTransitionHash(proof.sourceHashes) !== hustleSourceTransitionHash(source.currentSourceHashes) ||
    proof.verifiedAt > at || at - proof.verifiedAt >= 10 * 60_000)
    throw new Error('Fresh independently attested current published release required');
}
function repairWindow(now: number): boolean {
  return Number.isFinite(now) && now >= pins.fixTimestampMs && now < Date.parse('2026-11-21T23:00:00Z');
}
function grantTimes(grant: HustleSourceTransitionGrant | z.infer<typeof unsignedGrantSchema>, now: number) {
  if (!Number.isFinite(now) || grant.issuedAt > now || grant.expiresAt <= now ||
    !repairWindow(now) || !repairWindow(grant.issuedAt) || Math.abs(Date.now() - now) > 5000 ||
    grant.expiresAt <= grant.issuedAt || grant.expiresAt - grant.issuedAt > 60 * 60_000 ||
    grant.expiresAt > Date.parse('2026-11-21T23:00:00Z') ||
    grant.expiresAt > pins.consentExpiresAt || grant.directProof.verifiedAt < pins.fixTimestampMs ||
    grant.directProof.verifiedAt > grant.issuedAt || grant.issuedAt - grant.directProof.verifiedAt >= 10 * 60_000)
    throw new Error('Fresh actual direct provenance and unexpired one-hour grant required');
  if (hustleSourceTransitionHash(grant.directProof.directRecord) !== grant.directProof.directRecordSha256)
    throw new Error('Exact directly retrieved record digest required');
}
/** CLI-only trusted attestation issuer. A raw caller record/hash is NOT a tool attestation. */
export function issueHustleSourceTransitionGrantForVerifiedTask(input: HustleSourceTransitionSource & {
  directProof: HustleSourceTransitionDirectProof; productionRelease: HustleSourceTransitionProductionProof; expiresAt: number;
}, now = new Date()): HustleSourceTransitionGrant {
  environment(); const issuedAt = now.getTime();
  const unsigned = unsignedGrantSchema.parse({ version: 1, purpose: 'hustle-fixed-source-transition-only',
    executionTaskId: pins.executionTaskId, projectId: pins.projectId, appId: ENV.appId, campaignId: 1,
    grantId: randomBytes(24).toString('hex'), oldSourceHash: pins.oldSourceHash, oldSourceMapHash: pins.oldSourceMapHash,
    repairProofHash: pins.repairProofHash, currentCompleteSourceHash: input.currentCompleteSourceHash,
    currentSourceMapHash: hustleSourceTransitionHash(input.currentSourceHashes), issuedAt, expiresAt: input.expiresAt,
    directProof: input.directProof, productionRelease: input.productionRelease });
  grantTimes(unsigned, issuedAt); production(unsigned.productionRelease, input, issuedAt);
  return { ...unsigned, seal: mac('grant', unsigned) };
}
/** Admission ALWAYS precedes DB access; never a sender permit. */
export function verifyHustleSourceTransitionGrant(value: unknown, source: HustleSourceTransitionSource, now = new Date()): HustleSourceTransitionGrant {
  const grant = grantSchema.parse(value), { seal, ...unsigned } = grant;
  if (!validMac(seal, mac('grant', unsigned))) throw new Error('Invalid source-transition grant seal');
  environment(); grantTimes(grant, now.getTime()); production(grant.productionRelease, source, now.getTime());
  if (grant.currentCompleteSourceHash !== source.currentCompleteSourceHash ||
    grant.currentSourceMapHash !== hustleSourceTransitionHash(source.currentSourceHashes))
    throw new Error('Source changed; fresh fixed grant required');
  return grant;
}
const campaignBinding = (c: Row) => ({ id: c.id, slug: c.slug, status: c.status, configVersion: c.configVersion,
  episodeGoal: c.episodeGoal, launchApprovedAt: c.launchApprovedAt ?? null, schedulerTaskUid: c.schedulerTaskUid ?? null });
const sourceFields = ['campaignId', 'organizationKey', 'name', 'website', 'category', 'localEvidence', 'localSourceUrl',
  'contactName', 'contactTitle', 'recipientType', 'email', 'emailSourceUrl', 'emailSourceQuote', 'roleSourceUrl', 'phone', 'phoneSourceUrl', 'evidenceJson'];
const prospectBinding = (p: Row) => Object.fromEntries(sourceFields.map(k => [k, p[k] ?? null]));
function exactEvents(events: Row[]): void {
  if (!Array.isArray(events) || events.length > 100_000) throw new Error('Complete existing event history required');
  const historical = HUSTLE_SOURCE_TRANSITION_BASELINE_EVENT_IDS.map(id => {
    const found = events.filter(e => e.id === id);
    if (found.length !== 1 || found[0].campaignId !== 1) throw new Error('Missing/ambiguous immutable historical event');
    return found[0];
  });
  if (hustleSourceTransitionHash(historical) !== pins.historicalEventsHash) throw new Error('Immutable historical event bytes changed');
  for (const [key, pin] of Object.entries(HUSTLE_SOURCE_TRANSITION_OLD_ENVELOPES)) {
    const found = events.filter(e => e.eventKey === key);
    if (found.length !== 1 || found[0].campaignId !== 1 || found[0].eventType !== pin.eventType ||
      hustleSourceTransitionByteHash(found[0].detailJson) !== pin.detailSha256)
      throw new Error('Exact old envelope mapping/digest required');
  }
  // New inbox/maintenance outcomes may append. New authority, intent or replay is held.
  const baseline = new Set(HUSTLE_SOURCE_TRANSITION_BASELINE_EVENT_IDS);
  if (events.some(e => !baseline.has(e.id) && e.eventKey !== pins.receiptKey &&
    (/^hustle-(?:sponsored-|first-batch-|before-claim-recovery:|source-transition:)/.test(e.eventKey || '') ||
      /^hustle_(?:sponsored_|first_batch_)/.test(e.eventType || ''))))
    throw new Error('Competing authority/intent/replay held');
}
function verifyOldEnvelope(row: Row): Row {
  const e = JSON.parse(row.detailJson), { signature, ...unsigned } = e;
  const key = createHmac('sha256', hustleExistingSigningAuthority(ENV.cookieSecret))
    .update('jeristotle/hustle-sponsored-review/signing-key/v1').digest();
  const expected = createHmac('sha256', key).update('jeristotle/hustle-sponsored-review/envelope/v1\n')
    .update(sponsoredCanonicalJson(unsigned)).digest('hex');
  if (Object.keys(e).sort().join(',') !== 'actor,kind,payload,schemaVersion,signature,sourceHash,sourceVersion,version' ||
    e.version !== 1 || e.kind !== row.eventType || e.sourceHash !== pins.oldSourceHash ||
    !isHustleManagedOperatorActor(e.actor) || hustleSourceTransitionHash(e.actor) !== pins.originalActorHash ||
    !validMac(signature, expected)) throw new Error('Original actor/source/HMAC required');
  return e;
}
function accepted(m: Row): Date {
  if (m.status !== 'sent' || !(m.attemptedAt instanceof Date) || !(m.smtpAcceptedAt instanceof Date) ||
    m.smtpAcceptedAt < m.attemptedAt || !m.claimToken || !/^<[^<>\s]+@jeristotleproductions\.com>$/.test(m.providerMessageId || '') || m.error !== null)
    throw new Error('Original accepted receipt required; never retry');
  return m.smtpAcceptedAt;
}
function untouched(m: Row): void {
  if (m.status !== 'approved' || ['claimToken', 'attemptedAt', 'smtpAcceptedAt', 'providerMessageId', 'error'].some(k => !(k in m) || m[k] !== null))
    throw new Error('Only untouched approved second followup eligible');
}
/** Pure exact-row validation for locked real rows; no projection, repair or mutation.
 * Supplied approvals are HMAC-verified by the private apply path BEFORE this check.
 */
export function assertHustleSourceTransitionRows(state: { complete: true; campaign: Row; prospects: Row[]; messages: Row[] }, approvals: Row[], now: Date): void {
  const { campaign: c, prospects, messages } = state;
  if (state.complete !== true || c.id !== 1 || c.slug !== HUSTLE_SPONSORED_SLUG || c.status !== 'active' ||
    c.configVersion !== HUSTLE_SPONSORED_CONFIG_VERSION || c.episodeGoal !== 12 || c.schedulerTaskUid !== pins.schedulerTaskUid ||
    !Number.isFinite(now.getTime()) || now.getTime() >= pins.consentExpiresAt ||
    HUSTLE_SPONSORED_POLICY.dailyNewLimit !== 5 || HUSTLE_SPONSORED_POLICY.reserveTarget !== 30)
    throw new Error('Same existing campaign/UID/config/12/5/30 and unextended consent required');
  const targets = messages.filter(m => pins.prospectIds.includes(m.prospectId));
  if (targets.length !== 15 || new Set(targets.map(m => m.id)).size !== 15 || approvals.length !== 5)
    throw new Error('Exact original five/fifteen only');
  for (let i = 0; i < 5; i++) {
    const id = pins.prospectIds[i], rows = prospects.filter(p => p.id === id), p = rows[0];
    const authorities = approvals.filter(a => a.prospectId === id), a = authorities[0];
    if (rows.length !== 1 || authorities.length !== 1 || p.campaignId !== 1 || p.stage !== 'contacted' || p.qualification !== 'qualified' ||
      ['stoppedAt', 'manualNotes', 'holdReason'].some(k => !(k in p) || p[k] !== null)) throw new Error('Current recipient stop/hold/disposition blocks transition');
    if (a.campaignId !== 1 || a.reviewId !== pins.reviewId || a.sourceHash !== pins.oldSourceHash ||
      a.expiresAt !== pins.consentExpiresAt || a.approvedAt > now.getTime() || a.expiresAt - a.approvedAt > HUSTLE_SPONSORED_MAX_AGE_MS ||
      a.prospectBindingHash !== hustleSourceTransitionHash(prospectBinding(p)) ||
      a.campaignBindingHash !== hustleSourceTransitionHash(campaignBinding(c)) ||
      hustleSourceTransitionHash(a.headers) !== hustleSourceTransitionHash(HUSTLE_SPONSORED_HEADERS) ||
      a.fromDisplay !== HUSTLE_SPONSORED_FROM_DISPLAY || a.consolidatedFooterHomepageAndPolicyApproved !== true ||
      !Array.isArray(a.messages) || a.messages.length !== 3) throw new Error('Original consent/source/header/expiry binding changed');
    const record = sponsoredReviewRecordSchema.parse(a.record);
    if (sponsoredRecordBlockers(record, now).length) throw new Error('Current original record/source no longer applicable');
    for (let step = 0; step < 3; step++) {
      const messageId = 90001 + i * 3 + step, row = targets.find(m => m.id === messageId);
      const exact = a.messages.find((m: Row) => m.messageId === messageId), { messageId: ignored, ...body } = exact || {};
      if (!row || row.campaignId !== 1 || row.prospectId !== id || row.sequenceStep !== step || !exact ||
        exact.sequenceStep !== step || row.subject !== exact.subject || row.textBody !== exact.textBody ||
        hustleSourceTransitionHash(body) !== hustleSourceTransitionHash(record.messages[step]) || exact.to !== p.email)
        throw new Error('Exact original recipient/subject/text/HTML/footer/from/step mapping changed');
      if (step === 0 || (i < 4 && step === 1)) {
        const receipt = accepted(row);
        if (step === 0 && (!(p.firstSentAt instanceof Date) || p.firstSentAt.getTime() !== receipt.getTime()))
          throw new Error('Original prospect first acceptance changed');
        if ((i < 4 ? step === 1 : step === 0) && (!(p.lastSentAt instanceof Date) || p.lastSentAt.getTime() !== receipt.getTime()))
          throw new Error('Original prospect last acceptance changed');
      }
      else if (i < 4) {
        untouched(row); const previous = targets.find(m => m.id === messageId - 1)!;
        if (!(row.scheduledAt instanceof Date) || row.scheduledAt.getTime() !== getHustleSponsoredFollowupAt(accepted(previous), 2).getTime())
          throw new Error('Original second followup cadence changed');
      } else if (step === 1) {
        if (row.id !== 90014 || row.status !== 'cancelled' ||
          ['attemptedAt', 'smtpAcceptedAt', 'error'].some(k => row[k] !== null) ||
          hustleSourceTransitionHash(row) !== pins.cancelled90014RowHash)
          throw new Error('Cancelled original followup must remain untouched and excluded');
      } else { untouched(row); if (row.id !== 90015 || row.scheduledAt !== null) throw new Error('Unscheduled no-previous-acceptance original remains excluded'); }
    }
  }
}
function receiptPayload(grant: HustleSourceTransitionGrant, at: number, receiptNonce: string) {
  return { version: 1, purpose: 'hustle-fixed-source-transition-only', campaignId: 1,
    grantId: grant.grantId, nonce: receiptNonce, recordedAt: at,
    oldSourceHash: pins.oldSourceHash, oldSourceMapHash: pins.oldSourceMapHash,
    currentCompleteSourceHash: grant.currentCompleteSourceHash, currentSourceMapHash: grant.currentSourceMapHash,
    repairProofHash: pins.repairProofHash, baselineFileSha256: pins.baselineFileSha256,
    historicalEventsHash: pins.historicalEventsHash, originalActorHash: pins.originalActorHash,
    originalEnvelopeDigestsHash: hustleSourceTransitionHash(HUSTLE_SOURCE_TRANSITION_OLD_ENVELOPES),
    originalMessagesHash: pins.originalMessagesHash, cancelled90014RowHash: pins.cancelled90014RowHash, schedulerTaskUid: pins.schedulerTaskUid,
    configVersion: HUSTLE_SPONSORED_CONFIG_VERSION, episodeGoal: 12, dailyNewLimit: 5, reserveTarget: 30,
    allowedMessageIds: pins.allowedMessageIds, consentExpiresAt: pins.consentExpiresAt,
    directProof: grant.directProof, productionRelease: grant.productionRelease,
    noNewApproval: true, noResigning: true, noAutomaticRetry: true, noSends: true, noNewTimer: true };
}
export type HustleSourceTransitionAllowance = {
  receiptEventKey: string; oldSourceHash: string; currentCompleteSourceHash: string;
  allowedMessageIds: readonly number[]; oldEnvelopeDigests: typeof HUSTLE_SOURCE_TRANSITION_OLD_ENVELOPES;
  consentExpiresAt: number;
};
/** Pure read: accepts committed REAL events only; does not manufacture authority.
 * Durable production proof must have been fresh at recording, not refreshed or extended.
 * Current complete release/map is independently supplied by the main adapter.
 */
export function readHustleSourceTransitionReceipt(events: Row[], currentCompleteSourceHash: string,
  currentSourceHashes: Record<string, string>, campaign?: Row, now = new Date()): HustleSourceTransitionAllowance | null {
  try {
    const rows = events.filter(e => e.eventKey === pins.receiptKey || e.eventType === pins.receiptType);
    if (rows.length !== 1 || rows[0].campaignId !== 1 || rows[0].eventKey !== pins.receiptKey || rows[0].eventType !== pins.receiptType) return null;
    const sealed = JSON.parse(rows[0].detailJson), a = sealed.payload;
    if (Object.keys(sealed).sort().join(',') !== 'payload,signature' || !validMac(sealed.signature, mac('receipt', a))) return null;
    const productionRelease = productionSchema.parse(a.productionRelease), directProof = directSchema.parse(a.directProof);
    const source = { currentCompleteSourceHash, currentSourceHashes, releaseId: productionRelease.releaseId };
    production(productionRelease, source, a.recordedAt);
    nonce.parse(a.nonce); nonce.parse(a.grantId); time.parse(a.recordedAt);
    if (!Number.isFinite(now.getTime()) || a.recordedAt > now.getTime() || now.getTime() >= pins.consentExpiresAt ||
      !repairWindow(a.recordedAt) || hustleSourceTransitionHash(directProof.directRecord) !== directProof.directRecordSha256 ||
      directProof.verifiedAt < pins.fixTimestampMs || directProof.verifiedAt > a.recordedAt || a.recordedAt - directProof.verifiedAt >= 10 * 60_000) return null;
    // Reconstruct EVERY fixed payload property; unknown properties also fail.
    const expected = receiptPayload({ grantId: a.grantId, currentCompleteSourceHash, currentSourceMapHash: hustleSourceTransitionHash(currentSourceHashes),
      directProof, productionRelease } as HustleSourceTransitionGrant, a.recordedAt, a.nonce);
    if (hustleSourceTransitionHash(a) !== hustleSourceTransitionHash(expected)) return null;
    if (campaign && hustleSourceTransitionHash(campaignBinding(campaign)) !== pins.campaignBindingHash) return null;
    exactEvents(events);
    return { receiptEventKey: pins.receiptKey, oldSourceHash: pins.oldSourceHash, currentCompleteSourceHash,
      allowedMessageIds: Object.freeze([...pins.allowedMessageIds]), oldEnvelopeDigests: HUSTLE_SOURCE_TRANSITION_OLD_ENVELOPES,
      consentExpiresAt: pins.consentExpiresAt };
  } catch { return null; }
}
/** Exact event-only exception, NEVER a wildcard old-source exemption. Sender additionally
 * requires allowance.allowedMessageIds.includes(message.id) for dispatch authorization.
 */
export function hustleSourceTransitionAllowsEvent(allowance: HustleSourceTransitionAllowance | null, event: Row | undefined, oldSourceHash: string): boolean {
  if (!allowance || !event || oldSourceHash !== allowance.oldSourceHash || event.campaignId !== 1) return false;
  const pin = allowance.oldEnvelopeDigests[event.eventKey];
  return Boolean(pin && pin.oldSourceHash === oldSourceHash && event.eventType === pin.eventType &&
    hustleSourceTransitionByteHash(event.detailJson) === pin.detailSha256);
}
/** Parent adapter aliases: pass complete real events, never last100 or RPC rows. */
export function readTransition(events: Row[], now: Date, currentSourceHash: string, currentMap: Record<string, string>): HustleSourceTransitionAllowance | null {
  return readHustleSourceTransitionReceipt(events, currentSourceHash, currentMap, undefined, now);
}
export function allowsEvent(event: Row | undefined, context: HustleSourceTransitionAllowance | null): boolean {
  return hustleSourceTransitionAllowsEvent(context, event, context?.oldSourceHash ?? '');
}
/** Parent remains responsible for original HMAC, prior acceptance, stops, quota and
 * its real claim ownership guard. Only its exclusive current claim can advance;
 * attempted/accepted/error/cancelled states are never admitted through this bridge.
 */
export function readTransitionMessageGate(context: HustleSourceTransitionAllowance | null, message: Row,
  options: { ownedClaimToken?: string } = {}): boolean {
  if (!context || !context.allowedMessageIds.includes(message.id) || message.campaignId !== 1 || message.sequenceStep !== 2 ||
    ['attemptedAt', 'smtpAcceptedAt', 'error'].some(k => !(k in message) || message[k] !== null) ||
    !(message.scheduledAt instanceof Date) || message.scheduledAt.toISOString() !== '2026-11-24T15:00:00.000Z') return false;
  if (message.status === 'approved') return message.claimToken === null && message.providerMessageId === null;
  return message.status === 'claimed' && Boolean(options.ownedClaimToken) && message.claimToken === options.ownedClaimToken &&
    /^<[^<>\s]+@jeristotleproductions\.com>$/.test(message.providerMessageId || '');
}
/** One existing campaign-lock transaction; SELECT all persisted campaign rows, append
 * exactly ONE event. No prospect/message/campaign UPDATE, no settings, no providers.
 */
export async function applyHustleSourceTransition(grantValue: unknown, source: HustleSourceTransitionSource, now = new Date()) {
  const grant = verifyHustleSourceTransitionGrant(grantValue, source, now);
  if (Math.abs(Date.now() - now.getTime()) > 5000) throw new Error('Actual current apply clock required');
  const { getDb } = await import('./db');
  const db = await getDb(); if (!db) throw new Error('Existing authoritative database unavailable; held');
  const { eq } = await import('drizzle-orm');
  const { hustleCampaigns, hustleProspects, hustleMessages, hustleEvents } = await import('../drizzle/schema');
  return db.transaction(async tx => {
    const campaigns = await tx.select().from(hustleCampaigns).where(eq(hustleCampaigns.id, 1)).for('update');
    if (campaigns.length !== 1) throw new Error('Exact existing campaign lock required');
    const prospects = await tx.select().from(hustleProspects).for('update');
    const messages = await tx.select().from(hustleMessages).for('update');
    const events = await tx.select().from(hustleEvents).for('update');
    if (events.some(e => e.eventKey === pins.receiptKey || e.eventType === pins.receiptType)) throw new Error('Source transition already recorded; no replay');
    const currentEvents = events.filter(e => e.campaignId === 1); exactEvents(currentEvents);
    assertFinalOriginalHistoricalEvents(currentEvents);
    const currentMessages = messages.filter(m => m.campaignId === 1).sort((a, b) => a.id - b.id);
    if (hustleSourceTransitionHash(currentMessages) !== pins.originalMessagesHash ||
      hustleSourceTransitionHash(campaignBinding(campaigns[0])) !== pins.campaignBindingHash)
      throw new Error('Full persisted original payload/receipt/claim/cadence baseline changed');
    const approvals = pins.prospectIds.map(id => {
      const row = currentEvents.find(e => e.eventKey === `hustle-sponsored-authorization:${pins.reviewId}:${id}`)!;
      return verifyOldEnvelope(row).payload;
    });
    // Current-source sponsored envelopes retain exactly their original HMAC and actor.
    for (const [key, pin] of Object.entries(HUSTLE_SOURCE_TRANSITION_OLD_ENVELOPES)) {
      const row = currentEvents.find(e => e.eventKey === key)!;
      if (pin.eventType.startsWith('hustle_sponsored_')) verifyOldEnvelope(row);
      else {
        const sealed = JSON.parse(row.detailJson);
        const expected = createHmac('sha256', hustleExistingSigningAuthority(ENV.cookieSecret))
          .update('jeristotle/hustle-task-first-batch/v1\n').update(sponsoredCanonicalJson(sealed.payload)).digest('hex');
        if (Object.keys(sealed).sort().join(',') !== 'payload,signature' || !validMac(sealed.signature, expected) ||
          sealed.payload.serverSourceHash !== pins.oldSourceHash ||
          (sealed.payload.actor && (!isHustleManagedOperatorActor(sealed.payload.actor) || hustleSourceTransitionHash(sealed.payload.actor) !== pins.originalActorHash)))
          throw new Error('Original task HMAC/source/actor required');
      }
    }
    if (currentEvents.some(e => !HUSTLE_SOURCE_TRANSITION_BASELINE_EVENT_IDS.includes(e.id) && pins.prospectIds.includes(e.prospectId as number)))
      throw new Error('New target history/stop/contact outcome held; inspect without retry');
    assertHustleSourceTransitionRows({ complete: true, campaign: campaigns[0], prospects, messages }, approvals, now);
    // Reuse the existing full persisted suppression/cross-campaign/source reader,
    // under this same campaign lock; no projected rows or caller conflict waivers.
    const { getHustleSponsoredExclusions } = await import('./hustleSponsoredReviewDb');
    const exclusions = await getHustleSponsoredExclusions(tx);
    if (exclusions.complete !== true || approvals.some(a => exclusions.blockersFor(a.record, a.prospectId).length))
      throw new Error('Fresh complete current suppression/cross-campaign exclusions block transition');
    // Reverify clock/authority immediately before the sole write, after all locking reads.
    verifyHustleSourceTransitionGrant(grant, source, new Date());
    const payload = receiptPayload(grant, Date.now(), randomBytes(24).toString('hex'));
    const detailJson = JSON.stringify({ payload, signature: mac('receipt', payload) });
    if (Buffer.byteLength(detailJson) >= 60_000) throw new Error('Bounded source-transition event required');
    await tx.insert(hustleEvents).values({ campaignId: 1, eventKey: pins.receiptKey, eventType: pins.receiptType, detailJson });
    return { recorded: true, receiptEventKey: pins.receiptKey, allowedMessageIds: [...pins.allowedMessageIds],
      oldSourceHash: pins.oldSourceHash, currentCompleteSourceHash: source.currentCompleteSourceHash,
      noNewApproval: true, noResigning: true, noAutomaticRetry: true, noSends: true };
  });
}
