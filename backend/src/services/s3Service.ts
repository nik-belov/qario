import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import stream from 'stream';
import { promisify } from 'util';
import fs from 'fs';

const pipeline = promisify(stream.pipeline);
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export const downloadFileFromS3 = async (
  fileUrl: string,
  outputPath: string
) => {
  const params = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: fileUrl,
  };

  const command = new GetObjectCommand(params);
  const response = await s3Client.send(command);
  const fileStream = fs.createWriteStream(outputPath);
  await pipeline(response.Body as stream.Readable, fileStream);
};

export const uploadFileToS3 = async (
  fileBuffer: Buffer,
  fileName: string,
  contentType: string
): Promise<string> => {
  const params = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: fileName,
    Body: fileBuffer,
    ContentType: contentType,
  };

  const command = new PutObjectCommand(params);
  await s3Client.send(command);
  return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.amazonaws.com/${fileName}`;
};
