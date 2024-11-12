import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable, pipeline as streamPipeline } from 'stream';
import { promisify } from 'util';
import { createWriteStream } from 'fs';
import fs from 'fs';

// Update the pipeline type to be more specific
const pipeline = promisify(streamPipeline);
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
  maxAttempts: 3, // Add retry capability
});

export const downloadFileFromS3 = async (
  fileUrl: string,
  outputPath: string,
  retryCount = 3
): Promise<string> => {
  try {
    console.log(`Starting download of ${fileUrl}`);

    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileUrl,
    };

    const command = new GetObjectCommand(params);
    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new Error(`No body in response for file: ${fileUrl}`);
    }

    const writeStream = createWriteStream(outputPath);
    const readStream = response.Body as Readable;

    let downloadedBytes = 0;
    const totalBytes = Number(response.ContentLength) || 0;
    const startTime = Date.now();

    readStream.on('error', (error) => {
      console.error(`Error in read stream for ${fileUrl}:`, error);
      writeStream.destroy();
    });

    writeStream.on('error', (error) => {
      console.error(`Error in write stream for ${fileUrl}:`, error);
      readStream.destroy();
    });

    readStream.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      const speedMBps = (
        downloadedBytes /
        1024 /
        1024 /
        elapsedSeconds
      ).toFixed(2);
      const progress = totalBytes
        ? `${((downloadedBytes / totalBytes) * 100).toFixed(1)}%`
        : `${(downloadedBytes / 1024 / 1024).toFixed(1)} MB`;
      process.stdout.write(
        `\rDownloading ${fileUrl}: ${progress} (${speedMBps} MB/s)`
      );
    });

    await pipeline(readStream, writeStream);

    // Verify file was written correctly
    const stats = await fs.promises.stat(outputPath);
    if (totalBytes && stats.size !== totalBytes) {
      throw new Error(
        `File size mismatch for ${fileUrl}. Expected: ${totalBytes}, Got: ${stats.size}`
      );
    }

    console.log(
      `\nSuccessfully downloaded ${fileUrl} (${(
        stats.size /
        1024 /
        1024
      ).toFixed(2)} MB)`
    );
    return outputPath;
  } catch (error) {
    console.error(`Failed to download ${fileUrl}:`, error);

    // Clean up failed download
    if (fs.existsSync(outputPath)) {
      try {
        await fs.promises.unlink(outputPath);
        console.log(`Cleaned up failed download: ${outputPath}`);
      } catch (cleanupError) {
        console.error(`Failed to clean up file ${outputPath}:`, cleanupError);
      }
    }

    // Retry logic
    if (retryCount > 0) {
      console.log(
        `Retrying download of ${fileUrl} (${retryCount} attempts remaining)...`
      );
      return downloadFileFromS3(fileUrl, outputPath, retryCount - 1);
    }

    throw error;
  }
};

export const uploadFileToS3 = async (
  fileBuffer: Buffer,
  fileName: string,
  contentType: string
): Promise<string> => {
  try {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileName,
      Body: fileBuffer,
      ContentType: contentType,
    };

    console.log(
      `Starting upload of ${fileName} (${(
        fileBuffer.length /
        1024 /
        1024
      ).toFixed(2)} MB)`
    );
    const command = new PutObjectCommand(params);
    await s3Client.send(command);
    const url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.amazonaws.com/${fileName}`;
    console.log(`Successfully uploaded ${fileName}`);
    return url;
  } catch (error) {
    console.error(`Failed to upload ${fileName}:`, error);
    throw error;
  }
};
