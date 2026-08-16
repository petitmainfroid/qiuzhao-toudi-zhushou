// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectZhilianSearchCards, ZhilianPageReader } from './zhilian-page-reader.mjs';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fixed Zhilian page reader', () => {
  it('collects bounded visible public cards and deduplicates normalized links', async () => {
    document.body.innerHTML = `<section><article class="joblist-box__item">
      <a href="http://www.zhaopin.com/jobdetail/abc.htm?trace=1">算法工程师</a>
      <a href="https://www.zhaopin.com/companydetail/example">示例公司</a>
      <div class="jobinfo__tag">机器学习</div>
      <a href="https://www.zhaopin.com/jobdetail/abc.htm">算法工程师</a>
    </article></section>`;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 20 } as DOMRect);
    const result = await collectZhilianSearchCards(5);
    expect(result).toEqual({ candidates: [{
      jobUrl: 'https://www.zhaopin.com/jobdetail/abc.htm', title: '算法工程师',
      company: '示例公司', description: '机器学习'
    }] });
  });

  it('uses only the fixed evaluation source and fails on page drift', async () => {
    const connection = { cdpPort: 1, targetId: 'target', origin: 'https://www.zhaopin.com', pathPattern: '/sou/example/p1' };
    const send = vi.fn().mockResolvedValue({ result: { value: { candidates: [] } } });
    const close = vi.fn();
    const findTarget = vi.fn()
      .mockResolvedValueOnce({ origin: connection.origin, pathPattern: connection.pathPattern })
      .mockResolvedValueOnce({ origin: connection.origin, pathPattern: '/sou/changed/p1' });
    const reader = new ZhilianPageReader({ connection, cdpFactory: () => ({ send, close }), findTarget });
    await expect(reader.readPage({ page: 1, remaining: 5, deadlineMs: 200 })).rejects.toThrow('page_drift');
    expect(send.mock.calls[0][0]).toBe('Runtime.evaluate');
    expect(send.mock.calls[0][1].expression).toContain('collectZhilianSearchCards');
    expect(send.mock.calls[0][2]).toBe(200);
    expect(close).toHaveBeenCalledOnce();
    expect(collectZhilianSearchCards.toString()).not.toMatch(/cookie|localStorage|sessionStorage|\.value\b|\.click\(|XMLHttpRequest|innerHTML|outerHTML/i);
    expect(collectZhilianSearchCards.toString()).toContain("credentials: 'omit'");
  });

  it('replaces the search summary with a bounded credential-free detail read', async () => {
    document.body.innerHTML = `<article class="joblist-box__item">
      <a href="http://www.zhaopin.com/jobdetail/abc.htm">算法工程师</a>
      <a href="/companydetail/example">示例公司</a>
      <div class="jobinfo__tag">搜索摘要</div>
    </article>`;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 20 } as DOMRect);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<div class="describtion-card__detail-content">完整职位描述</div>'
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await collectZhilianSearchCards(1, 1);
    expect(result.candidates[0].description).toBe('完整职位描述');
    expect(fetchMock).toHaveBeenCalledWith('https://www.zhaopin.com/jobdetail/abc.htm', {
      credentials: 'omit', redirect: 'follow'
    });
  });
});
