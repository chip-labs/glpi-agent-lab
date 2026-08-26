FROM php:8.3-apache

# Versão fixada deliberadamente — ver Global Constraints.
ARG GLPI_VERSION=11.0.8

RUN apt-get update && apt-get install -y --no-install-recommends \
      libpng-dev libjpeg-dev libfreetype6-dev libzip-dev libicu-dev \
      libxml2-dev libbz2-dev libldap2-dev libsodium-dev \
      default-mysql-client curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-configure ldap --with-libdir="lib/$(dpkg-architecture -qDEB_HOST_MULTIARCH)" \
    && docker-php-ext-install -j"$(nproc)" \
       mysqli gd intl zip bz2 ldap exif opcache sodium bcmath

RUN a2enmod rewrite

RUN curl -fsSL \
      "https://github.com/glpi-project/glpi/releases/download/${GLPI_VERSION}/glpi-${GLPI_VERSION}.tgz" \
      -o /tmp/glpi.tgz \
    && tar -xzf /tmp/glpi.tgz -C /var/www \
    && rm /tmp/glpi.tgz \
    && chown -R www-data:www-data /var/www/glpi

# GLPI 11 serve a partir de public/
ENV APACHE_DOCUMENT_ROOT=/var/www/glpi/public
RUN sed -ri 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' \
      /etc/apache2/sites-available/*.conf /etc/apache2/apache2.conf \
    && printf '<Directory /var/www/glpi/public>\n  AllowOverride All\n  Require all granted\n</Directory>\n' \
       > /etc/apache2/conf-available/glpi.conf \
    && a2enconf glpi

WORKDIR /var/www/glpi
