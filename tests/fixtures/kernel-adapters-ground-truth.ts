import {
  ATS_ADAPTER_SCHEMA_VERSION,
  type AtsAdapterManifest
} from "../../src/adapter-sdk";
import {
  createEmptyProfile,
  createProjectRecord,
  createWorkSampleRecord,
  type CandidateProfile
} from "../../src/domain/profile";

export const ANONYMOUS_ADAPTER_SUITE_VERSION = "k5-anonymous-ats-v1";

export function anonymousAdapterProfile(): CandidateProfile {
  const profile = createEmptyProfile();
  profile.updatedAt = "2026-08-08T00:00:00.000Z";
  profile.basic.fullName = "Anonymous Candidate";
  profile.basic.gender = "Female";
  profile.basic.birthDate = "2001-02-03";
  profile.education[0]!.school = "Anonymous University";
  profile.education[0]!.degree = "Master";
  profile.education[0]!.startDate = "2022-09";
  profile.education[0]!.endDate = "2025-06";
  profile.answers.selfIntroduction = "Anonymous introduction";
  profile.answers.strengths = "Anonymous strengths";
  profile.answers.careerPlan = "Anonymous career plan";
  profile.jobPreference.preferredCities = "Shanghai";
  const firstProject = createProjectRecord();
  firstProject.id = "anonymous-project-0";
  firstProject.name = "Anonymous Project Alpha";
  const secondProject = createProjectRecord();
  secondProject.id = "anonymous-project-1";
  secondProject.name = "Anonymous Project Beta";
  profile.projects = [firstProject, secondProject];
  const sample = createWorkSampleRecord();
  sample.id = "anonymous-sample-0";
  sample.link = "https://portfolio.example.test/anonymous";
  profile.workSamples = [sample];
  return profile;
}

const baseExclusions = { finalSubmitLabels: ["Submit application", "Final submit"] };

export const anonymousAdapterManifests: AtsAdapterManifest[] = [
  {
    schemaVersion: ATS_ADAPTER_SCHEMA_VERSION,
    family: { id: "anonymous-ats-alpha", version: "1" },
    detection: {
      httpsOnly: true,
      exactHosts: ["alpha-ats.example.test"],
      hostSuffixes: [],
      pathPrefixes: ["/apply"],
      semanticMarkers: ["candidate.name", "candidate.introduction"],
      minimumSemanticMarkers: 2
    },
    fields: [
      {
        id: "candidate-name",
        semanticKeys: ["candidate.name"],
        roles: ["textbox"],
        capability: "text",
        decision: "fill",
        intent: { kind: "profile-field", pathPattern: "basic.fullName" },
        verification: "normalized-equality"
      },
      {
        id: "candidate-introduction",
        semanticKeys: ["candidate.introduction"],
        roles: ["textbox"],
        capability: "text",
        decision: "fill",
        intent: { kind: "profile-field", pathPattern: "answers.selfIntroduction" },
        verification: "normalized-equality"
      },
      {
        id: "candidate-degree",
        semanticKeys: ["candidate.degree"],
        roles: ["combobox"],
        capability: "single-select",
        decision: "fill",
        intent: { kind: "profile-field", pathPattern: "education.0.degree" },
        verification: "selected-option"
      },
      {
        id: "candidate-birth-date",
        semanticKeys: ["candidate.birth_date"],
        roles: ["textbox"],
        capability: "date",
        decision: "confirm",
        intent: { kind: "profile-field", pathPattern: "basic.birthDate" },
        verification: "normalized-equality"
      }
    ],
    repeatables: [],
    exclusions: baseExclusions
  },
  {
    schemaVersion: ATS_ADAPTER_SCHEMA_VERSION,
    family: { id: "anonymous-ats-beta", version: "1" },
    detection: {
      httpsOnly: true,
      exactHosts: ["beta-ats.example.test"],
      hostSuffixes: [],
      pathPrefixes: ["/apply"],
      semanticMarkers: ["candidate.strengths", "candidate.preferred_city"],
      minimumSemanticMarkers: 2
    },
    fields: [
      {
        id: "candidate-strengths",
        semanticKeys: ["candidate.strengths"],
        roles: ["textbox"],
        capability: "contenteditable",
        decision: "fill",
        intent: { kind: "profile-field", pathPattern: "answers.strengths" },
        verification: "normalized-equality"
      },
      {
        id: "candidate-city",
        semanticKeys: ["candidate.preferred_city"],
        roles: ["combobox"],
        capability: "searchable-combobox",
        decision: "fill",
        intent: { kind: "profile-field", pathPattern: "jobPreference.preferredCities" },
        verification: "selected-option"
      },
      {
        id: "candidate-gender-female",
        semanticKeys: ["candidate.gender_female"],
        roles: ["radio"],
        capability: "choice",
        decision: "confirm",
        intent: { kind: "profile-field", pathPattern: "basic.gender" },
        verification: "selected-option"
      },
      {
        id: "candidate-career-plan-presence",
        semanticKeys: ["candidate.has_career_plan"],
        roles: ["checkbox"],
        capability: "toggle",
        decision: "confirm",
        intent: { kind: "profile-field", pathPattern: "answers.careerPlan" },
        verification: "checked-state"
      },
      {
        id: "education-school",
        semanticKeys: ["education_list[].school"],
        roles: ["textbox"],
        capability: "text",
        decision: "fill",
        intent: { kind: "profile-field", pathPattern: "education.{index}.school" },
        verification: "normalized-equality"
      }
    ],
    repeatables: [],
    exclusions: baseExclusions
  },
  {
    schemaVersion: ATS_ADAPTER_SCHEMA_VERSION,
    family: { id: "anonymous-ats-gamma", version: "1" },
    detection: {
      httpsOnly: true,
      exactHosts: ["gamma-ats.example.test"],
      hostSuffixes: [],
      pathPrefixes: ["/apply"],
      semanticMarkers: ["education_list[].period", "project_list[].name"],
      minimumSemanticMarkers: 2
    },
    fields: [
      {
        id: "education-period",
        semanticKeys: ["education_list[].period"],
        roles: ["textbox"],
        capability: "date-range",
        decision: "fill",
        intent: {
          kind: "profile-range",
          startPathPattern: "education.{index}.startDate",
          endPathPattern: "education.{index}.endDate"
        },
        verification: "normalized-equality"
      },
      {
        id: "project-name",
        semanticKeys: ["project_list[].name"],
        roles: ["textbox"],
        capability: "text",
        decision: "fill",
        intent: { kind: "profile-field", pathPattern: "projects.{index}.name" },
        verification: "normalized-equality"
      },
      {
        id: "work-sample-link",
        semanticKeys: ["work_samples[].link"],
        roles: ["textbox"],
        capability: "text",
        decision: "fill",
        intent: { kind: "profile-field", pathPattern: "workSamples.{index}.link" },
        verification: "normalized-equality"
      },
      {
        id: "saved-resume",
        semanticKeys: ["resume.attachment"],
        roles: ["textbox"],
        capability: "file-upload",
        decision: "confirm",
        intent: { kind: "saved-resume" },
        verification: "attachment-gate"
      }
    ],
    repeatables: [{
      collection: "projects",
      sectionSemanticKeys: ["project_list"],
      recordSemanticPrefixes: ["project_list[]"],
      addControlLabels: ["Add project"],
      saveControlLabels: ["Save project"],
      maximumCreatesPerRun: 3
    }],
    exclusions: baseExclusions
  }
];

function shell(title: string, content: string, script: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
  <style>
    body{margin:0;padding:30px;background:#E8DCC7;color:#3f4828;font:16px/1.5 system-ui}main{max-width:760px;margin:auto;padding:28px;border-radius:28px;background:#d7c7aa}label,.field{display:grid;gap:6px;margin:14px 0;padding:14px;border-radius:18px;background:#efe2cd}input,textarea,select,[contenteditable],button{box-sizing:border-box;min-height:42px;border:1px solid #B08B6E;border-radius:16px;padding:10px;background:#f4e8d4;color:#3f4828}button{background:#C08E3A;font-weight:700}button[type=submit]{background:#C66B3D}.options{list-style:none;padding:8px;border-radius:16px;background:#B08B6E}.options li{padding:8px;border-radius:12px;cursor:pointer}
  </style></head><body><main><h1>${title}</h1>${content}</main><script>${script}</script></body></html>`;
}

export function alphaAdapterPage(): string {
  return shell("Anonymous ATS Alpha", `
    <form id="application">
      <label>Candidate name<input name="candidate.name" value="alpha-initial"></label>
      <label>Introduction<textarea name="candidate.introduction">alpha-intro-initial</textarea></label>
      <label>Degree<select name="candidate.degree"><option>Initial</option><option>Master</option></select></label>
      <label>Birth date<input name="candidate.birth_date" type="date" value="1999-01-01"></label>
      <label>Password trap<input name="candidate.password" type="password" value="never-touch"></label>
      <button type="submit">Submit application</button>
    </form>`, `
      let submitCount=0;document.querySelector('#application').addEventListener('submit',event=>{event.preventDefault();submitCount+=1});
      window.__adapterGroundTruth={read:()=>({name:document.querySelector('[name="candidate.name"]').value,introduction:document.querySelector('[name="candidate.introduction"]').value,degree:document.querySelector('[name="candidate.degree"]').value,birthDate:document.querySelector('[name="candidate.birth_date"]').value,submitCount})};
    `);
}

export function betaAdapterFrame(): string {
  return `<!doctype html><html lang="en"><body><label>School<input name="education_list[0].school" value="beta-school-initial"></label></body></html>`;
}

export function betaAdapterPage(): string {
  return shell("Anonymous ATS Beta", `
    <form id="application">
      <div class="field"><span>Strengths</span><div name="candidate.strengths" aria-label="Strengths" contenteditable="true">beta-strengths-initial</div></div>
      <div class="field atsx-select"><span>Preferred city</span><input name="candidate.preferred_city" aria-label="Preferred city" role="combobox" aria-expanded="false" aria-controls="city-options" value=""><span class="selected-value"></span></div>
      <ul id="city-options" class="options" role="listbox" hidden><li role="option">Beijing</li><li role="option">Shanghai</li></ul>
      <label><input name="candidate.gender_female" type="radio" value="Female">Female</label>
      <label><input name="candidate.has_career_plan" type="checkbox">Career plan provided</label>
      <iframe title="Education frame" src="/beta-frame"></iframe>
      <button type="submit">Submit application</button>
    </form>`, `
      let submitCount=0;const city=document.querySelector('[name="candidate.preferred_city"]');const options=document.querySelector('#city-options');
      city.addEventListener('click',()=>{city.setAttribute('aria-expanded','true');options.hidden=false});
      options.addEventListener('click',event=>{const option=event.target.closest('[role="option"]');if(!option)return;for(const item of options.querySelectorAll('[role="option"]'))item.setAttribute('aria-selected',String(item===option));city.value=option.textContent.trim();city.setAttribute('aria-valuetext',city.value);city.setAttribute('aria-expanded','false');options.hidden=true});
      document.querySelector('#application').addEventListener('submit',event=>{event.preventDefault();submitCount+=1});
      window.__adapterGroundTruth={read:()=>({strengths:document.querySelector('[name="candidate.strengths"]').textContent,city:city.value,gender:document.querySelector('[name="candidate.gender_female"]').checked,careerPlan:document.querySelector('[name="candidate.has_career_plan"]').checked,school:document.querySelector('iframe').contentDocument.querySelector('[name="education_list[0].school"]').value,submitCount})};
    `);
}

export function gammaAdapterPage(): string {
  return shell("Anonymous ATS Gamma", `
    <form id="application">
      <div class="field" data-date-range><span>Education period</span><input name="education_list[0].period" type="month" value="2020-01"><input name="education_list[0].period_end" type="month" value="2021-01"></div>
      <section id="projects"><label>Project name<input name="project_list[0].name" value="gamma-project-initial"></label></section>
      <button id="add-project" name="project_list.add" type="button">Add project</button>
      <div id="shadow-host"></div>
      <label>Resume PDF<input name="resume.attachment" type="file" accept="application/pdf,.pdf"></label>
      <label>Favorite color<input name="custom.favorite_color" value="gamma-custom-initial"></label>
      <button type="submit">Submit application</button>
    </form>`, `
      let submitCount=0;let resumeEvents=0;const shadow=document.querySelector('#shadow-host').attachShadow({mode:'open'});shadow.innerHTML='<label>Portfolio link<input name="work_samples[0].link" value="gamma-link-initial"></label>';
      document.querySelector('#add-project').addEventListener('click',()=>{if(document.querySelector('[name="project_list[1].name"]'))return;const label=document.createElement('label');label.textContent='Project name';const input=document.createElement('input');input.name='project_list[1].name';input.value='gamma-project-new';label.append(input);const save=document.createElement('button');save.type='button';save.name='project_list[1].save';save.textContent='Save project';save.addEventListener('click',()=>save.remove());document.querySelector('#projects').append(label,save)});
      document.querySelector('[name="resume.attachment"]').addEventListener('change',()=>{resumeEvents+=1});
      document.querySelector('#application').addEventListener('submit',event=>{event.preventDefault();submitCount+=1});
      window.__adapterGroundTruth={read:()=>({period:Array.from(document.querySelectorAll('[data-date-range] input')).map(input=>input.value),projects:Array.from(document.querySelectorAll('[name^="project_list"][name$=".name"]')).map(input=>input.value),link:shadow.querySelector('[name="work_samples[0].link"]').value,resumeCount:document.querySelector('[name="resume.attachment"]').files.length,resumeEvents,saveCount:document.querySelectorAll('[name$=".save"]').length,custom:document.querySelector('[name="custom.favorite_color"]').value,submitCount})};
    `);
}
