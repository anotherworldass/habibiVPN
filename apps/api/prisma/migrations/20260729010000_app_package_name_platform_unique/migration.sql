-- Allow same package_name on different platforms (e.g. iOS + Android).
DROP INDEX `app_packages_package_name_key` ON `app_packages`;

CREATE UNIQUE INDEX `app_packages_package_name_platform_key` ON `app_packages`(`package_name`, `platform`);
