// CI/CD RimbaGuard untuk Delcom: uji, bungkus kode sumber, lalu minta Delcom melakukan redeploy.
// Diadaptasi dari Jenkinsfile contoh Delcom. URL_REDEPLOY, URL_PROGRESS, DEPLOY_TOKEN dan WEBSITE_ID
// berasal dari "Prepare an environment for the run" pada job Jenkins (konfigurasi website di Delcom).
// Kredensial aplikasi (Supabase, Gemini) tidak pernah ada di repo: isi di tab .env website Delcom.
pipeline {

    agent any

    options {
        timestamps()
        skipDefaultCheckout(true)
        skipStagesAfterUnstable()
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        // Pasang dependensi dan jalankan uji unit; deploy dibatalkan bila ada yang gagal.
        stage('Install & Test') {
            agent {
                docker {
                    image 'node:24-alpine'
                    reuseNode true
                }
            }

            steps {
                sh '''
                    set -e
                    export npm_config_cache="$WORKSPACE/.npm-ci-cache"

                    echo "=== Installing Dependencies ==="
                    npm ci --no-audit --no-fund

                    echo "=== Running Unit Tests ==="
                    npm run test

                    echo "=== Tests Passed ==="
                '''
            }
        }

        stage('Package Application') {
            agent {
                docker {
                    image 'node:24-alpine'
                    reuseNode true
                    args '-u root'
                }
            }

            steps {
                sh '''
                    set -e

                    apk add --no-cache zip unzip

                    rm -f latest-app.zip

                    zip -r latest-app.zip . \
                        -x "node_modules/*" \
                        -x ".git/*" \
                        -x ".env" \
                        -x ".env.*" \
                        -x ".nuxt/*" \
                        -x ".output/*" \
                        -x ".npm-ci-cache/*" \
                        -x "coverage/*" \
                        -x "test-results/*" \
                        -x "playwright-report/*" \
                        -x "latest-app.zip"

                    echo "=== Application Package Created ==="
                    ls -lh latest-app.zip
                '''
            }
        }

        stage('Publish Application') {
            steps {
                archiveArtifacts(
                    artifacts: 'latest-app.zip',
                    fingerprint: true,
                    allowEmptyArchive: false
                )

                script {
                    def appName = env.JOB_NAME
                        .replaceAll('[^a-zA-Z0-9._-]', '-')
                        .replaceAll('-+', '-')
                        .replaceAll('^-|-$', '')

                    def buildId = env.BUILD_NUMBER

                    sh """
                        set -e

                        docker exec cicd-jenkins \
                            mkdir -p \
                            "/var/jenkins_home/userContent/applications/${appName}/${buildId}"

                        docker cp \
                            latest-app.zip \
                            "cicd-jenkins:/var/jenkins_home/userContent/applications/${appName}/${buildId}/latest-app.zip"
                    """

                    def jenkinsBaseUrl = env.BUILD_URL
                        .substring(0, env.BUILD_URL.indexOf('/job/'))
                        .replace('localhost', 'host.docker.internal')

                    env.ARTIFACT_URL =
                        "${jenkinsBaseUrl}/userContent/applications/${appName}/${buildId}/latest-app.zip"

                    echo "Artifact URL: ${env.ARTIFACT_URL}"
                }
            }
        }

        stage('Deploy Application') {
            agent {
                docker {
                    image 'curlimages/curl:8.15.0'
                    reuseNode true
                    args '--network cicd-network'
                }
            }

            steps {
                script {
                    def redeployResponse = sh(
                        script: '''
                            set -e

                            curl -sS --fail-with-body \
                                -X POST "$URL_REDEPLOY" \
                                -H "Content-Type: application/json" \
                                -d "{
                                    \\"token_access\\": \\"$DEPLOY_TOKEN\\",
                                    \\"website_id\\": \\"$WEBSITE_ID\\",
                                    \\"source_url\\": \\"$ARTIFACT_URL\\",
                                    \\"source_type\\": \\"jenkins\\"
                                }"
                        ''',
                        returnStdout: true
                    ).trim()

                    echo "Redeploy Response: ${redeployResponse}"

                    def maxAttempts = 120
                    def attempt = 0
                    def deploymentStatus = 'IN_PROGRESS'

                    while (deploymentStatus == 'IN_PROGRESS') {
                        attempt++
                        if (attempt > maxAttempts) {
                            error("Deployment timeout: masih IN_PROGRESS setelah ${maxAttempts} percobaan.")
                        }

                        sleep time: 5, unit: 'SECONDS'

                        def progressResponse = sh(
                            script: '''
                                set -e

                                curl -sS --fail-with-body \
                                    -X POST "$URL_PROGRESS" \
                                    -H "Content-Type: application/json" \
                                    -d "{
                                        \\"token_access\\": \\"$DEPLOY_TOKEN\\",
                                        \\"website_id\\": \\"$WEBSITE_ID\\"
                                    }"
                            ''',
                            returnStdout: true
                        ).trim()

                        def json = readJSON text: progressResponse
                        deploymentStatus = json?.data?.status?.toString()?.toUpperCase()

                        if (!deploymentStatus) {
                            error("Response progress tidak memiliki data.status")
                        }

                        echo "Deployment Status (${attempt}/${maxAttempts}): ${deploymentStatus}"

                        if (deploymentStatus == 'SUCCESS') {
                            echo "DEPLOYMENT SUCCESS"
                            break
                        }

                        if (deploymentStatus == 'FAIL') {
                            echo "========== DEPLOYMENT LOG =========="
                            echo(json?.data?.log ?: 'Deployment failed tanpa log.')
                            echo "===================================="
                            error("Deployment gagal untuk website ${WEBSITE_ID}")
                        }
                    }
                }
            }
        }
    }

    post {
        success {
            echo "PIPELINE SUCCESS: ${env.ARTIFACT_URL ?: '(not published)'}"
        }
        failure {
            echo "PIPELINE FAILED: periksa log stage yang merah atau Console Output."
        }
    }
}
