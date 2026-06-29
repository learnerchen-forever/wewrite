// T049: Unit tests for DraftService

import { DraftService } from '../../../src/publisher/draft-service';
import { WeChatApiManager } from '../../../src/publisher/api-manager';

jest.mock('obsidian', () => ({ requestUrl: jest.fn(), Platform: { isDesktop: true, isMobile: false } }));

describe('DraftService', () => {
  let service: DraftService;
  let apiManager: WeChatApiManager;

  beforeEach(() => {
    apiManager = new WeChatApiManager();
    service = new DraftService(apiManager);
  });

  describe('createDraft', () => {
    it('should throw error when API returns failure', async () => {
      // Mock request to fail
      jest.spyOn(apiManager, 'request').mockResolvedValue({
        success: false,
        error: { errcode: 40001, errmsg: 'invalid token', isFatal: false },
      });

      await expect(
        service.createDraft('wx', 'secret', { title: 'Test', content: '<p>Hi</p>', thumb_media_id: 'thumb123' }),
      ).rejects.toThrow('invalid token');
    });

    it('should use single attempt for draft creation (non-idempotent)', async () => {
      const requestSpy = jest.spyOn(apiManager, 'request').mockResolvedValue({
        success: true,
        data: { media_id: 'draft-001' },
      });

      await service.createDraft('wx', 'secret', { title: 'Test', content: '<p>Hi</p>', thumb_media_id: 'thumb123' });

      expect(requestSpy).toHaveBeenCalledWith('wx', 'secret', expect.objectContaining({
        method: 'POST',
        url: '/draft/add',
      }));
    });
  });

  describe('createNewsPicDraft', () => {
    it('should create a newspic draft with correct article_type', async () => {
      const requestSpy = jest.spyOn(apiManager, 'request').mockResolvedValue({
        success: true,
        data: { media_id: 'np-draft-001' },
      });

      const result = await service.createNewsPicDraft('wx', 'secret', {
        title: 'Image Post',
        content: '<p>Image content</p>',
        image_info: {
          image_list: [{ image_media_id: 'img-001' }],
        },
      });

      expect(result.success).toBe(true);
      expect(result.media_id).toBe('np-draft-001');
      expect(requestSpy).toHaveBeenCalledWith('wx', 'secret', expect.objectContaining({
        method: 'POST',
        url: '/draft/add',
      }));
    });

    it('should return failure when API returns error', async () => {
      jest.spyOn(apiManager, 'request').mockResolvedValue({
        success: false,
        error: { errcode: 40001, errmsg: 'invalid token', isFatal: false },
      });

      const result = await service.createNewsPicDraft('wx', 'secret', {
        title: 'Image Post',
        content: '<p>Image content</p>',
        image_info: {
          image_list: [{ image_media_id: 'img-001' }],
        },
      });

      expect(result.success).toBe(false);
      expect(result.error?.errmsg).toBe('invalid token');
    });

    it('should return failure when errcode is non-zero', async () => {
      jest.spyOn(apiManager, 'request').mockResolvedValue({
        success: true,
        data: { errcode: 45001, errmsg: 'media expired' },
      });

      const result = await service.createNewsPicDraft('wx', 'secret', {
        title: 'Image Post',
        content: '<p>Image content</p>',
        image_info: {
          image_list: [{ image_media_id: 'img-001' }],
        },
      });

      expect(result.success).toBe(false);
      expect(result.error?.errcode).toBe(45001);
      expect(result.error?.errmsg).toBe('media expired');
    });
  });

  describe('publishDraft', () => {
    it('should publish via freepublish endpoint', async () => {
      jest.spyOn(apiManager, 'request').mockResolvedValue({
        success: true,
        data: { publish_id: 'pub-001' },
      });

      const result = await service.publishDraft('wx', 'secret', 'draft-001');
      expect(result.publish_id).toBe('pub-001');
    });
  });
});
