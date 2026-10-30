import path from 'path';
import fs from 'fs';
import { Request, Response } from 'express';
import multer from 'multer';

import { getUploadConfig } from '../config';
import { success, badRequest, serverError, unauthorized } from '../utils/response';

const UPLOAD_CONFIG = getUploadConfig();
const ALLOWED_FILE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.md', '.txt', '.pdf', '.doc', '.docx'];

const isLoopback = (request: Request): boolean => {
  const ip = request.ip ?? request.socket.remoteAddress ?? '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
};

/**
 * 验证文件扩展名是否在允许的类型中
 */
const isAllowedFileType = (filename: string): boolean => {
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_FILE_EXTENSIONS.includes(ext);
};


/**
 * 获取应用文件存储目录
 */
const getFilesDirectory = (): string => {
  const filesDir = UPLOAD_CONFIG.dir;

  if (!fs.existsSync(filesDir)) {
    fs.mkdirSync(filesDir, { recursive: true });
    console.info('创建文件存储目录:', filesDir);
  }

  return filesDir;
};

/**
 * 生成安全的文件名
 */
const generateSafeFilename = (originalName: string): string => {
  const filename = Buffer.from(originalName, 'utf8').toString('utf8');
  const ext = path.extname(filename);
  const nameWithoutExt = path.basename(filename, ext);

  return `${nameWithoutExt}${ext}`;
};

// 配置存储位置
const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const filesDir = getFilesDirectory();
      cb(null, filesDir);
    } catch (error) {
      console.error('创建文件目录失败:', error);
      cb(error as Error, '');
    }
  },
  filename: (req, file, cb) => {
    try {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const safeFilename = generateSafeFilename(originalName);
      cb(null, safeFilename);
    } catch (error) {
      console.error('生成文件名失败:', error);
      cb(error as Error, '');
    }
  },
});

const documentUpload = multer({
  storage: fileStorage,
  fileFilter: (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (!isAllowedFileType(file.originalname)) {
      const allowedTypes = ALLOWED_FILE_EXTENSIONS.join('、');
      return cb(new Error(`只允许上传 ${allowedTypes} 文件`));
    }
    cb(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
}).single('file');

interface RequestWithFile extends Request {
  file?: Express.Multer.File;
}

/**
 * 统一的文件上传接口
 * 返回字段：url
 */
export const uploadFile = (req: RequestWithFile, res: Response): void => {
  const apiKey = req.headers['x-api-key'] || null;
  // 配置了上传密钥时必须匹配；未配置时仅允许本机调用
  if (UPLOAD_CONFIG.apiKey ? apiKey !== UPLOAD_CONFIG.apiKey : !isLoopback(req)) {
    unauthorized(res, 'apikey不正确');
    return;
  }
  documentUpload(req as any, res as any, async (err: any) => {
    if (err instanceof multer.MulterError) {
      return badRequest(res, `文件上传失败: ${err.message}`);
    } else if (err) {
      return badRequest(res, err.message);
    }

    try {
      if (!req.file) {
        return badRequest(res, '没有上传文件');
      }

      const fileName = path.basename(req.file.path);
      const url = `${UPLOAD_CONFIG.publicBaseUrl.replace(/\/+$/, '')}/files/${fileName}`;

      // 返回完整信息
      success(
        res,
        {
          url,
        },
        '文件上传成功',
      );
    } catch (error) {
      console.error('文件上传处理错误:', error);
      serverError(res, '文件上传处理失败');
    }
  });
};
