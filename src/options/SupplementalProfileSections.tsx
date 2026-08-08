import { BadgeCheck, BookOpen, ShieldAlert, Trash2, UsersRound, Plus } from "lucide-react";
import {
  createCampusActivityRecord,
  createCampusLeadershipRecord,
  createCertificateRecord,
  createFamilyMemberRecord,
  createPatentRecord,
  createPublicationRecord,
  type CandidateProfile,
  type ProfileValidation
} from "../domain/profile";

interface SupplementalProfileSectionsProps {
  profile: CandidateProfile;
  validation: ProfileValidation;
  update: (mutator: (draft: CandidateProfile) => void) => void;
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: "text" | "tel" | "date" | "month" | "url";
  placeholder?: string;
}

function Field({ label, value, onChange, error, type = "text", placeholder }: FieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        aria-label={label}
        aria-invalid={Boolean(error)}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <small className="field-error">{error}</small> : null}
    </label>
  );
}

function TextAreaField({ label, value, onChange, placeholder }: Omit<FieldProps, "type" | "error">) {
  return (
    <label className="field field-wide">
      <span>{label}</span>
      <textarea
        aria-label={label}
        value={value}
        placeholder={placeholder}
        rows={4}
        onChange={(event) => onChange(event.target.value)}
      />
      <small className="character-count" aria-hidden="true">{value.length} 字</small>
    </label>
  );
}

function SectionHeader({ icon, index, title, description }: {
  icon: React.ReactNode;
  index: string;
  title: string;
  description: string;
}) {
  return (
    <header className="section-header">
      <div className="section-index">{index}</div>
      <div className="section-icon" aria-hidden="true">{icon}</div>
      <div><h2>{title}</h2><p>{description}</p></div>
    </header>
  );
}

export function SupplementalProfileSections({ profile, validation, update }: SupplementalProfileSectionsProps) {
  const leadership = profile.campusLeadership ?? [];
  const activities = profile.campusActivities ?? [];
  const family = profile.familyMembers ?? [];
  const certificates = profile.certificates ?? [];
  const publications = profile.publications ?? [];
  const patents = profile.patents ?? [];

  return (
    <>
      <section className="form-card" id="campus">
        <SectionHeader index="08" icon={<UsersRound size={21} />} title="校园经历" description="在校职务和校园活动分开维护，便于不同招聘系统按自己的结构复用。" />

        <div className="subsection-heading"><h3>在校职务</h3><p>学生组织、班级、社团或院校层级的真实任职。</p></div>
        {leadership.length === 0 ? <p className="empty-copy">尚未添加在校职务。</p> : null}
        {leadership.map((record, index) => (
          <article className="repeat-card" key={record.id}>
            <div className="repeat-heading">
              <h3>在校职务 {index + 1}</h3>
              <button className="icon-text-button danger-button" type="button" aria-label={`删除在校职务 ${index + 1}`} onClick={() => update((draft) => { draft.campusLeadership ??= []; draft.campusLeadership.splice(index, 1); })}><Trash2 size={16} />删除</button>
            </div>
            <div className="field-grid">
              <Field label="职务名称" value={record.title} onChange={(value) => update((draft) => { draft.campusLeadership![index].title = value; })} />
              <Field label="干部级别" value={record.level} placeholder="例如：校级、院级、班级、社团" onChange={(value) => update((draft) => { draft.campusLeadership![index].level = value; })} />
              <Field label="组织或项目名称" value={record.organization} onChange={(value) => update((draft) => { draft.campusLeadership![index].organization = value; })} />
              <Field label="开始时间" type="month" value={record.startDate} onChange={(value) => update((draft) => { draft.campusLeadership![index].startDate = value; })} />
              <Field label="结束时间" type="month" value={record.endDate} error={validation.errors[`campusLeadership.${index}.endDate`]} onChange={(value) => update((draft) => { draft.campusLeadership![index].endDate = value; })} />
              <TextAreaField label="职务描述" value={record.description} onChange={(value) => update((draft) => { draft.campusLeadership![index].description = value; })} />
            </div>
          </article>
        ))}
        <button className="add-button" type="button" onClick={() => update((draft) => { draft.campusLeadership ??= []; draft.campusLeadership.push(createCampusLeadershipRecord()); })}><Plus size={17} />添加一段在校职务</button>

        <div className="subsection-heading subsection-spacing"><h3>校园活动</h3><p>社会实践、志愿活动、社团项目及其他校内外活动。</p></div>
        {activities.length === 0 ? <p className="empty-copy">尚未添加校园活动。</p> : null}
        {activities.map((record, index) => (
          <article className="repeat-card" key={record.id}>
            <div className="repeat-heading">
              <h3>校园活动 {index + 1}</h3>
              <button className="icon-text-button danger-button" type="button" aria-label={`删除校园活动 ${index + 1}`} onClick={() => update((draft) => { draft.campusActivities ??= []; draft.campusActivities.splice(index, 1); })}><Trash2 size={16} />删除</button>
            </div>
            <div className="field-grid">
              <Field label="活动名称" value={record.name} onChange={(value) => update((draft) => { draft.campusActivities![index].name = value; })} />
              <Field label="担任职务" value={record.role} onChange={(value) => update((draft) => { draft.campusActivities![index].role = value; })} />
              <Field label="实践方式" value={record.participationType} placeholder="例如：全职、兼职、志愿服务" onChange={(value) => update((draft) => { draft.campusActivities![index].participationType = value; })} />
              <Field label="开始时间" type="month" value={record.startDate} onChange={(value) => update((draft) => { draft.campusActivities![index].startDate = value; })} />
              <Field label="结束时间" type="month" value={record.endDate} error={validation.errors[`campusActivities.${index}.endDate`]} onChange={(value) => update((draft) => { draft.campusActivities![index].endDate = value; })} />
              <TextAreaField label="活动内容" value={record.description} onChange={(value) => update((draft) => { draft.campusActivities![index].description = value; })} />
            </div>
          </article>
        ))}
        <button className="add-button" type="button" onClick={() => update((draft) => { draft.campusActivities ??= []; draft.campusActivities.push(createCampusActivityRecord()); })}><Plus size={17} />添加一段校园活动</button>
      </section>

      <section className="form-card" id="certificates">
        <SectionHeader index="11" icon={<BadgeCheck size={21} />} title="证书信息" description="语言考试不在这里重复保存；这里记录职业资格和技能证书。" />
        {certificates.length === 0 ? <p className="empty-copy">尚未添加证书。</p> : null}
        {certificates.map((record, index) => (
          <article className="repeat-card" key={record.id}>
            <div className="repeat-heading"><h3>证书 {index + 1}</h3><button className="icon-text-button danger-button" type="button" aria-label={`删除证书 ${index + 1}`} onClick={() => update((draft) => { draft.certificates ??= []; draft.certificates.splice(index, 1); })}><Trash2 size={16} />删除</button></div>
            <div className="field-grid">
              <Field label="证书名称" value={record.name} onChange={(value) => update((draft) => { draft.certificates![index].name = value; })} />
              <Field label="颁发机构" value={record.issuingOrganization ?? ""} onChange={(value) => update((draft) => { draft.certificates![index].issuingOrganization = value; })} />
              <Field label="证书编号" value={record.credentialNumber ?? ""} onChange={(value) => update((draft) => { draft.certificates![index].credentialNumber = value; })} />
              <Field label="获得时间" type="month" value={record.date} onChange={(value) => update((draft) => { draft.certificates![index].date = value; })} />
              <Field label="有效期至" type="month" value={record.validUntil ?? ""} onChange={(value) => update((draft) => { draft.certificates![index].validUntil = value; })} />
              <TextAreaField label="证书描述" value={record.description} onChange={(value) => update((draft) => { draft.certificates![index].description = value; })} />
            </div>
          </article>
        ))}
        <button className="add-button" type="button" onClick={() => update((draft) => { draft.certificates ??= []; draft.certificates.push(createCertificateRecord()); })}><Plus size={17} />添加一项证书</button>
      </section>

      <section className="form-card" id="research">
        <SectionHeader index="12" icon={<BookOpen size={21} />} title="论文与专利" description="仅填写有来源依据的科研成果；没有的字段保持空白。" />
        <div className="subsection-heading"><h3>论文期刊</h3><p>论文名称、刊物、作者顺序和公开链接。</p></div>
        {publications.length === 0 ? <p className="empty-copy">尚未添加论文期刊。</p> : null}
        {publications.map((record, index) => (
          <article className="repeat-card" key={record.id}>
            <div className="repeat-heading"><h3>论文期刊 {index + 1}</h3><button className="icon-text-button danger-button" type="button" aria-label={`删除论文期刊 ${index + 1}`} onClick={() => update((draft) => { draft.publications ??= []; draft.publications.splice(index, 1); })}><Trash2 size={16} />删除</button></div>
            <div className="field-grid">
              <Field label="论文名称" value={record.title} onChange={(value) => update((draft) => { draft.publications![index].title = value; })} />
              <Field label="刊物名称" value={record.journal} onChange={(value) => update((draft) => { draft.publications![index].journal = value; })} />
              <Field label="发表时间" type="month" value={record.publishedAt} onChange={(value) => update((draft) => { draft.publications![index].publishedAt = value; })} />
              <Field label="刊物层级" value={record.tier} placeholder="例如：SCI 一区、中文核心" onChange={(value) => update((draft) => { draft.publications![index].tier = value; })} />
              <Field label="论文作者顺序" value={record.authorPosition} onChange={(value) => update((draft) => { draft.publications![index].authorPosition = value; })} />
              <Field label="期刊影响因子" value={record.impactFactor} onChange={(value) => update((draft) => { draft.publications![index].impactFactor = value; })} />
              <Field label="论文链接" type="url" value={record.link} placeholder="https://" onChange={(value) => update((draft) => { draft.publications![index].link = value; })} />
              <TextAreaField label="论文描述" value={record.description} onChange={(value) => update((draft) => { draft.publications![index].description = value; })} />
            </div>
          </article>
        ))}
        <button className="add-button" type="button" onClick={() => update((draft) => { draft.publications ??= []; draft.publications.push(createPublicationRecord()); })}><Plus size={17} />添加一篇论文</button>

        <div className="subsection-heading subsection-spacing"><h3>专利成果</h3><p>专利名称、编号、类型和简要说明。</p></div>
        {patents.length === 0 ? <p className="empty-copy">尚未添加专利。</p> : null}
        {patents.map((record, index) => (
          <article className="repeat-card" key={record.id}>
            <div className="repeat-heading"><h3>专利 {index + 1}</h3><button className="icon-text-button danger-button" type="button" aria-label={`删除专利 ${index + 1}`} onClick={() => update((draft) => { draft.patents ??= []; draft.patents.splice(index, 1); })}><Trash2 size={16} />删除</button></div>
            <div className="field-grid">
              <Field label="专利名称" value={record.name} onChange={(value) => update((draft) => { draft.patents![index].name = value; })} />
              <Field label="专利编号" value={record.number} onChange={(value) => update((draft) => { draft.patents![index].number = value; })} />
              <Field label="专利类型" value={record.type} placeholder="例如：发明专利、实用新型专利" onChange={(value) => update((draft) => { draft.patents![index].type = value; })} />
              <Field label="专利状态" value={record.status ?? ""} placeholder="例如：申请中、已公开、已授权" onChange={(value) => update((draft) => { draft.patents![index].status = value; })} />
              <TextAreaField label="专利成果" value={record.description} onChange={(value) => update((draft) => { draft.patents![index].description = value; })} />
            </div>
          </article>
        ))}
        <button className="add-button" type="button" onClick={() => update((draft) => { draft.patents ??= []; draft.patents.push(createPatentRecord()); })}><Plus size={17} />添加一项专利</button>
      </section>

      <section className="form-card sensitive-card" id="family">
        <SectionHeader index="13" icon={<ShieldAlert size={21} />} title="家庭与紧急联系人" description="可选高敏信息，仅在招聘表明确要求时填写，并且每次都需要你确认。" />
        <div className="sensitive-notice" role="note">家庭成员资料涉及第三方隐私，请先取得对方同意，网页填入前仍需确认；不要在这里保存对方证件号码、验证码或账号密码。</div>
        <div className="field-grid">
          <Field label="紧急联系人" value={profile.basic.emergencyContactName ?? ""} onChange={(value) => update((draft) => { draft.basic.emergencyContactName = value; })} />
          <Field label="紧急联系人电话" type="tel" value={profile.basic.emergencyContactPhone ?? ""} error={validation.errors["basic.emergencyContactPhone"]} onChange={(value) => update((draft) => { draft.basic.emergencyContactPhone = value; })} />
        </div>
        {family.length === 0 ? <p className="empty-copy subsection-spacing">尚未添加家庭成员。</p> : null}
        {family.map((record, index) => (
          <article className="repeat-card" key={record.id}>
            <div className="repeat-heading"><h3>家庭成员 {index + 1}</h3><button className="icon-text-button danger-button" type="button" aria-label={`删除家庭成员 ${index + 1}`} onClick={() => update((draft) => { draft.familyMembers ??= []; draft.familyMembers.splice(index, 1); })}><Trash2 size={16} />删除</button></div>
            <div className="field-grid">
              <Field label="家庭成员姓名" value={record.name} onChange={(value) => update((draft) => { draft.familyMembers![index].name = value; })} />
              <Field label="与本人关系" value={record.relationship} onChange={(value) => update((draft) => { draft.familyMembers![index].relationship = value; })} />
              <Field label="工作单位" value={record.employer} onChange={(value) => update((draft) => { draft.familyMembers![index].employer = value; })} />
              <Field label="联系电话" type="tel" value={record.phone} error={validation.errors[`familyMembers.${index}.phone`]} onChange={(value) => update((draft) => { draft.familyMembers![index].phone = value; })} />
              <Field label="职务" value={record.role} onChange={(value) => update((draft) => { draft.familyMembers![index].role = value; })} />
              <Field label="出生日期" type="date" value={record.birthDate} onChange={(value) => update((draft) => { draft.familyMembers![index].birthDate = value; })} />
              <Field label="家庭所在地" value={record.location} onChange={(value) => update((draft) => { draft.familyMembers![index].location = value; })} />
              <Field label="家庭成员政治面貌" value={record.politicalStatus ?? ""} onChange={(value) => update((draft) => { draft.familyMembers![index].politicalStatus = value; })} />
            </div>
          </article>
        ))}
        <button className="add-button" type="button" onClick={() => update((draft) => { draft.familyMembers ??= []; draft.familyMembers.push(createFamilyMemberRecord()); })}><Plus size={17} />添加一位家庭成员</button>
      </section>
    </>
  );
}
