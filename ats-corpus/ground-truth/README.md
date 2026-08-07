# Company-classified ATS ground truth

Ground truth is independent expected structure used to judge later anonymous observations. New multi-family captures are organized as `ground-truth/<ats-family>/<company>/` so both the ATS family and company are visible without opening the JSON. Older flat artifacts remain in place until an explicit migration is reviewed.

## Classified captures

| Company | ATS family | Classification | Page | Artifact | Evidence status |
| --- | --- | --- | --- | --- | --- |
| 小米（Xiaomi） | `feishu-recruiting` | Shared Feishu-related ATS | 实习申请 | `feishu-recruiting/xiaomi/xiaomi__internship-application__v1.json` | Public schema ground truth; authenticated write verification still pending |
| MetaApp | `feishu-recruiting` | Shared Feishu Recruiting ATS | 校园申请 | `feishu-recruiting/metaapp/metaapp__campus-application__v1.json` | Public schema ground truth; authenticated rendered DOM still pending |
| 联想（Lenovo） | `lenovo-talent` | Company-branded talent system | PC 候选人简历编辑 | `lenovo-talent/lenovo/lenovo__candidate-resume-editor__v1.json` | Public component/dictionary contract; authenticated rendered DOM still pending |
| 携程集团（Trip.com Group） | `ctrip-careers-custom` | Company-owned custom ATS | 社会招聘简历编辑 | `ctrip-careers-custom/ctrip/ctrip__experienced-edit-cv__v1.json` | Public HTML/i18n/static-bundle contract; authenticated rendered DOM still pending |
| 虎牙直播 | `moka` | Shared Moka ATS tenant | 校招候选人“我的简历” | `moka/huya/huya__campus-candidate-resume__v1.json` | Public tenant-shell/standard-resume bundle contract; authenticated rendered DOM still pending |

Files in this tree contain no candidate values, authentication state, request/response bodies, filenames, raw HTML, selectors, or session identifiers. A public contract does not become real-page support evidence until a developer-triggered anonymous rendered-page observation is compared against it.
