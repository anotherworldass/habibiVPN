-- Allow login OTP purpose on email_otps
ALTER TABLE `email_otps`
  MODIFY COLUMN `purpose` ENUM('register', 'login') NOT NULL;
