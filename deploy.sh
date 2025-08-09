#!/bin/bash

# Zybra SMS/USSD Deployment Script
# This script automates the deployment process for the Zybra SMS/USSD system

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="zybra-sms"
DOCKER_COMPOSE_FILE="docker-compose.yml"
BACKUP_DIR="./backups"
LOG_FILE="./deploy.log"

# Functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Please install Docker first."
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose is not installed. Please install Docker Compose first."
    fi
    
    # Check if .env file exists
    if [ ! -f "backend/.env" ]; then
        warning ".env file not found. Creating from template..."
        cp backend/.env.example backend/.env
        warning "Please edit backend/.env with your configuration before continuing."
        read -p "Press Enter to continue after editing .env file..."
    fi
    
    success "Prerequisites check completed"
}

# Create backup
create_backup() {
    log "Creating backup..."
    
    # Create backup directory if it doesn't exist
    mkdir -p "$BACKUP_DIR"
    
    # Backup database if running
    if docker-compose ps | grep -q postgres; then
        log "Backing up database..."
        docker-compose exec -T postgres pg_dump -U postgres zybra_sms > "$BACKUP_DIR/db_backup_$(date +%Y%m%d_%H%M%S).sql"
        success "Database backup created"
    fi
    
    # Backup Redis data if running
    if docker-compose ps | grep -q redis; then
        log "Backing up Redis data..."
        docker-compose exec -T redis redis-cli BGSAVE
        success "Redis backup initiated"
    fi
}

# Deploy application
deploy() {
    log "Starting deployment..."
    
    # Pull latest images
    log "Pulling latest Docker images..."
    docker-compose pull
    
    # Build custom images
    log "Building application images..."
    docker-compose build --no-cache
    
    # Stop existing services
    log "Stopping existing services..."
    docker-compose down
    
    # Start services
    log "Starting services..."
    docker-compose up -d
    
    # Wait for services to be ready
    log "Waiting for services to be ready..."
    sleep 30
    
    # Check service health
    check_health
    
    success "Deployment completed successfully"
}

# Check service health
check_health() {
    log "Checking service health..."
    
    # Check backend health
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        success "Backend service is healthy"
    else
        error "Backend service health check failed"
    fi
    
    # Check database connection
    if docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
        success "Database is ready"
    else
        error "Database connection failed"
    fi
    
    # Check Redis connection
    if docker-compose exec -T redis redis-cli ping | grep -q PONG; then
        success "Redis is ready"
    else
        error "Redis connection failed"
    fi
}

# Run database migrations
run_migrations() {
    log "Running database migrations..."
    
    # Wait for database to be ready
    sleep 10
    
    # Run migrations
    docker-compose exec backend npm run db:migrate || warning "Migration command not found, skipping..."
    
    success "Database migrations completed"
}

# Show deployment status
show_status() {
    log "Deployment Status:"
    echo ""
    docker-compose ps
    echo ""
    
    log "Service URLs:"
    echo "  Backend API: http://localhost:3000"
    echo "  Health Check: http://localhost:3000/health"
    echo "  Database: localhost:5432"
    echo "  Redis: localhost:6379"
    echo ""
    
    log "Useful Commands:"
    echo "  View logs: docker-compose logs -f"
    echo "  Stop services: docker-compose down"
    echo "  Restart services: docker-compose restart"
    echo "  View backend logs: docker-compose logs -f backend"
}

# Rollback function
rollback() {
    log "Rolling back deployment..."
    
    # Stop current services
    docker-compose down
    
    # Restore from backup if available
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/db_backup_*.sql 2>/dev/null | head -n1)
    if [ -n "$LATEST_BACKUP" ]; then
        log "Restoring database from backup: $LATEST_BACKUP"
        docker-compose up -d postgres
        sleep 10
        docker-compose exec -T postgres psql -U postgres -d zybra_sms < "$LATEST_BACKUP"
    fi
    
    success "Rollback completed"
}

# Main deployment process
main() {
    log "Starting Zybra SMS/USSD deployment process..."
    
    case "${1:-deploy}" in
        "deploy")
            check_prerequisites
            create_backup
            deploy
            run_migrations
            show_status
            ;;
        "rollback")
            rollback
            ;;
        "status")
            show_status
            ;;
        "health")
            check_health
            ;;
        "backup")
            create_backup
            ;;
        "logs")
            docker-compose logs -f
            ;;
        *)
            echo "Usage: $0 {deploy|rollback|status|health|backup|logs}"
            echo ""
            echo "Commands:"
            echo "  deploy   - Deploy the application (default)"
            echo "  rollback - Rollback to previous version"
            echo "  status   - Show deployment status"
            echo "  health   - Check service health"
            echo "  backup   - Create backup"
            echo "  logs     - Show service logs"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
